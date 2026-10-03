import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  CodeProviderRegistry,
  CodeProviderError,
  CodeModelNotConfiguredError,
  CODE_PROVIDER_CONTRACT,
  buildCodeRequest,
  wrapProposal,
  validateCodeProvider,
  stubCodeProvider,
  SandboxRunner,
  SandboxError,
  NoSandboxAvailableError,
  SANDBOX_CONTRACT,
  SANDBOX_LIMITS,
  buildRunSpec,
  validateSandbox,
  NoSandbox,
  AuditLog,
  AuditError,
  AUDIT_EVENTS
} from '../src/index.js'

function fakeCodeProvider(overrides = {}) {
  return {
    name: 'fake',
    available: true,
    propose: async (request) => ({ code: `-- ${request.task}`, language: 'sql', notes: 'ok' }),
    ...overrides
  }
}

function fakeSandbox(overrides = {}) {
  return {
    name: 'fake',
    available: true,
    run: async () => ({ exitCode: 0, stdout: 'ok', stderr: '', durationMs: 5, timedOut: false }),
    ...overrides
  }
}

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-audit-'))
  return path.join(dir, name)
}

test('the code provider contract declares its three members', () => {
  assert.deepEqual(Object.keys(CODE_PROVIDER_CONTRACT).sort(), ['available', 'name', 'propose'])
})

test('a malformed code provider is rejected at registration', () => {
  assert.throws(() => validateCodeProvider({ name: 'x', available: true }), /propose/)
  assert.throws(() => validateCodeProvider(null), /must be an object/)
})

test('the stub code provider is registered but unavailable', async () => {
  const registry = new CodeProviderRegistry()
  registry.register(stubCodeProvider)

  assert.equal(registry.active(), null)
  await assert.rejects(() => registry.propose({ task: 'build a dashboard' }), CodeModelNotConfiguredError)
})

test('a code request requires a task and a valid language', () => {
  assert.throws(() => buildCodeRequest({}), /task is required/)
  assert.throws(() => buildCodeRequest({ task: 'x', language: 'cobol' }), /language must be one of/)
  assert.equal(buildCodeRequest({ task: 'x' }).language, 'text')
})

test('a proposal carries provenance and is never marked applied', async () => {
  const registry = new CodeProviderRegistry()
  registry.register(fakeCodeProvider())
  const proposal = await registry.propose({ task: 'add an index', language: 'sql', touchesSchema: true })

  assert.match(proposal.id, /^[0-9a-f-]{36}$/)
  assert.equal(proposal.provider, 'fake')
  assert.equal(proposal.applied, false)
  assert.equal(proposal.touchesSchema, true)
  assert.match(proposal.digest, /^[0-9a-f]{64}$/)
})

test('a proposal with no code is rejected', () => {
  const request = buildCodeRequest({ task: 'x', language: 'sql' })
  assert.throws(() => wrapProposal(request, { language: 'sql' }, { providerName: 'fake' }), /no code/)
  assert.throws(
    () => wrapProposal(request, { code: 'x', language: 'cobol' }, { providerName: 'fake' }),
    /proposal.language/
  )
})

test('the sandbox contract declares its three members', () => {
  assert.deepEqual(Object.keys(SANDBOX_CONTRACT).sort(), ['available', 'name', 'run'])
})

test('no sandbox is available by default', async () => {
  const runner = new SandboxRunner()
  runner.register(NoSandbox)

  assert.equal(runner.active(), null)
  await assert.rejects(() => runner.run({ id: '1', code: 'console.log(1)', language: 'javascript' }), NoSandboxAvailableError)
})

test('a run spec enforces the declared limits', () => {
  const spec = buildRunSpec(
    { id: 'p1', code: 'console.log(1)', language: 'javascript' },
    { timeoutMs: 999_999, maxOutputBytes: 999_999 }
  )

  assert.equal(spec.timeoutMs, SANDBOX_LIMITS.timeoutMs)
  assert.equal(spec.maxOutputBytes, SANDBOX_LIMITS.maxOutputBytes)
  assert.equal(spec.allowNetwork, false)
})

test('network access is off unless explicitly requested', () => {
  const base = { id: 'p1', code: 'x', language: 'javascript' }

  assert.equal(buildRunSpec(base).allowNetwork, false)
  assert.equal(buildRunSpec(base, { allowNetwork: true }).allowNetwork, true)
})

test('a schema-modifying proposal is refused at the sandbox boundary', () => {
  const schemaCode = { id: 'p1', code: 'create policy p on artists using (true);', language: 'sql' }

  assert.throws(() => buildRunSpec(schemaCode), SandboxError)
  assert.throws(() => buildRunSpec(schemaCode), /Schema changes go through MigrationGate/)
})

test('running truncates output to the declared cap', async () => {
  const runner = new SandboxRunner()
  runner.register(fakeSandbox({ run: async () => ({ exitCode: 0, stdout: 'x'.repeat(999_999), stderr: '', durationMs: 1 }) }))

  const result = await runner.run({ id: 'p', code: 'x', language: 'javascript' })
  assert.equal(result.stdout.length, SANDBOX_LIMITS.maxOutputBytes)
})

test('a malformed sandbox is rejected at registration', () => {
  assert.throws(() => validateSandbox({ name: 'x', available: true }), /sandbox\.run/)
})

test('the audit log records events and reads them back', () => {
  const log = new AuditLog(tempFile('audit.log'))
  log.append('proposal.created', { proposalId: 'p1', provider: 'fake' })
  log.append('migration.approved', { migrationId: 'm1', approvedBy: 'deangelo' })

  const all = log.read()
  assert.equal(all.length, 2)
  assert.equal(log.read({ event: 'proposal.created' }).length, 1)
  assert.equal(log.read({ limit: 1 }).length, 1)
  assert.equal(log.trailFor('p1').length, 1)
})

test('an unknown audit event is rejected', () => {
  const log = new AuditLog(tempFile('audit2.log'))
  assert.throws(() => log.append('proposal.smuggled'), AuditError)
  assert.ok(AUDIT_EVENTS.includes('sandbox.run'))
})

test('a corrupt audit line is skipped rather than losing the log', () => {
  const file = tempFile('audit3.log')
  const log = new AuditLog(file)
  log.append('proposal.created', { proposalId: 'p1' })

  fs.appendFileSync(file, '{ broken json\n')
  log.append('proposal.created', { proposalId: 'p2' })

  assert.equal(log.read().length, 2)
})
