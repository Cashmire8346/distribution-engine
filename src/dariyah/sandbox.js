// Da'Riyah App Builder - sandbox contract.
//
// Division 2 generates applications. Generated code is UNTRUSTED and must never
// run in the same process as this engine, with this engine's credentials. The
// sandbox is the boundary.
//
// No sandbox implementation exists in this repository. `NoSandbox` rejects
// every run. The contract exists so that connecting one (a container runner, a
// microVM, a hosted execution service) is one object satisfying SANDBOX_CONTRACT.
//
// Design rules encoded here, not left to the implementer:
//   - generated code never receives real credentials, only a scoped token
//   - every run is time-bounded and output-bounded
//   - network access is opt-in per run, off by default
//   - nothing generated may touch the live database

import crypto from 'node:crypto'
import { MigrationGateError } from './migrations.js'

export const SANDBOX_CONTRACT = Object.freeze({
  name: 'string',
  available: 'boolean',
  // run(spec) -> Promise<{ exitCode, stdout, stderr, durationMs, timedOut }>
  run: 'function'
})

export const SANDBOX_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  maxOutputBytes: 256_000,
  allowNetwork: false
})

export class SandboxError extends MigrationGateError {
  constructor(message, details = {}) {
    super(message, details)
    this.name = 'SandboxError'
  }
}

export class NoSandboxAvailableError extends SandboxError {
  constructor(reason) {
    super(`No sandbox is available: ${reason}`, { field: 'sandbox', implemented: false })
    this.name = 'NoSandboxAvailableError'
  }
}

export function validateSandbox(sandbox) {
  if (!sandbox || typeof sandbox !== 'object') {
    throw new SandboxError('sandbox must be an object', { field: 'sandbox' })
  }
  for (const [key, type] of Object.entries(SANDBOX_CONTRACT)) {
    if (typeof sandbox[key] !== type) {
      throw new SandboxError(`sandbox.${key} must be a ${type}`, { field: `sandbox.${key}` })
    }
  }
  return sandbox
}

// Builds the run spec handed to a sandbox. Enforces the limits rather than
// trusting the caller to pass safe values.
export function buildRunSpec(proposal, options = {}) {
  if (!proposal || typeof proposal !== 'object' || typeof proposal.code !== 'string') {
    throw new SandboxError('a code proposal is required', { field: 'proposal' })
  }

  const timeoutMs = Math.min(Number(options.timeoutMs) || SANDBOX_LIMITS.timeoutMs, SANDBOX_LIMITS.timeoutMs)
  const maxOutputBytes = Math.min(Number(options.maxOutputBytes) || SANDBOX_LIMITS.maxOutputBytes, SANDBOX_LIMITS.maxOutputBytes)

  // A column-writing statement must not reach a sandbox that can reach the
  // database. Schema-language proposals are refused here outright.
  if (/\brow\s+level\s+security\b|\bcreate\s+policy\b|\bdrop\s+table\b|\balter\s+table\b/i.test(proposal.code)) {
    throw new SandboxError(
      'Refusing to sandbox a schema-modifying proposal. Schema changes go through MigrationGate, not the sandbox.',
      { field: 'proposal.code', touchesSchema: true }
    )
  }

  return Object.freeze({
    id: crypto.randomUUID(),
    proposalId: proposal.id ?? null,
    language: proposal.language,
    code: proposal.code,
    timeoutMs,
    maxOutputBytes,
    // Off unless explicitly requested, and safe defaults are the floor.
    allowNetwork: options.allowNetwork === true ? true : SANDBOX_LIMITS.allowNetwork,
    // Never the engine's credentials.
    env: Object.freeze({ ...(options.env ?? {}) })
  })
}

export const NoSandbox = Object.freeze({
  name: 'none',
  available: false,
  async run() {
    throw new NoSandboxAvailableError('no execution backend is connected')
  }
})

export class SandboxRunner {
  #sandboxes = new Map()
  #active = null

  register(sandbox) {
    const valid = validateSandbox(sandbox)
    if (this.#sandboxes.has(valid.name)) {
      throw new SandboxError(`sandbox "${valid.name}" is already registered`, { field: 'sandbox.name' })
    }
    this.#sandboxes.set(valid.name, valid)
    if (this.#active === null && valid.available) this.#active = valid.name
    return valid
  }

  active() {
    return this.#active === null ? null : this.#sandboxes.get(this.#active)
  }

  list() {
    return [...this.#sandboxes.values()].map((sandbox) => ({
      name: sandbox.name,
      available: sandbox.available,
      active: sandbox.name === this.#active
    }))
  }

  async run(proposal, options = {}) {
    const sandbox = this.active()
    if (!sandbox) throw new NoSandboxAvailableError('no available sandbox is registered')

    const spec = buildRunSpec(proposal, options)
    const result = await sandbox.run(spec)

    // Results are truncated to the declared cap, so a runaway program cannot
    // flood the caller.
    return {
      specId: spec.id,
      exitCode: Number(result.exitCode),
      stdout: String(result.stdout ?? '').slice(0, spec.maxOutputBytes),
      stderr: String(result.stderr ?? '').slice(0, spec.maxOutputBytes),
      durationMs: Number(result.durationMs ?? 0),
      timedOut: Boolean(result.timedOut)
    }
  }
}
