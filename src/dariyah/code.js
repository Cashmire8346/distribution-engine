// Da'Riyah Engineering - code-model adapter contract.
//
// Division 3 asks a model to write code: SQL, migrations, Edge Functions,
// TypeScript. That model is reached through a PROVIDER implementing the
// contract below.
//
// No provider in this repository writes code. `stubCodeProvider` throws. The
// contract exists so that connecting a model is one file, and so that every
// provider is validated and its output gated identically.
//
// IMPORTANT: a provider's output is UNTRUSTED TEXT. It is never executed and
// never applied. Anything schema-modifying goes through MigrationGate; anything
// else goes through the sandbox contract. See sandbox.js.

import crypto from 'node:crypto'
import { MigrationGateError } from './migrations.js'

export const CODE_PROVIDER_CONTRACT = Object.freeze({
  name: 'string',
  available: 'boolean',
  // propose(request) -> Promise<{ code, language, notes }>
  propose: 'function'
})

export const CODE_LANGUAGES = Object.freeze(['sql', 'typescript', 'javascript', 'tsx', 'json', 'text'])

export class CodeProviderError extends MigrationGateError {
  constructor(message, details = {}) {
    super(message, details)
    this.name = 'CodeProviderError'
  }
}

export class CodeModelNotConfiguredError extends CodeProviderError {
  constructor(providerName, reason) {
    super(`${providerName} code provider is not configured: ${reason}`, {
      field: 'codeProvider',
      provider: providerName,
      implemented: false
    })
    this.name = 'CodeModelNotConfiguredError'
  }
}

export function validateCodeProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new CodeProviderError('code provider must be an object', { field: 'codeProvider' })
  }
  for (const [key, type] of Object.entries(CODE_PROVIDER_CONTRACT)) {
    if (typeof provider[key] !== type) {
      throw new CodeProviderError(`codeProvider.${key} must be a ${type}`, { field: `codeProvider.${key}` })
    }
  }
  return provider
}

// The request a provider receives. `task` is the natural-language instruction;
// `context` is whatever the caller wants the model to see.
export function buildCodeRequest(input = {}) {
  const task = input.task
  if (typeof task !== 'string' || task.trim() === '') {
    throw new CodeProviderError('task is required', { field: 'task' })
  }

  const language = input.language ?? 'text'
  if (!CODE_LANGUAGES.includes(language)) {
    throw new CodeProviderError(`language must be one of ${CODE_LANGUAGES.join(', ')}`, { field: 'language' })
  }

  return Object.freeze({
    task: task.trim(),
    language,
    context: input.context ?? null,
    // Schema-touching output must be flagged so the caller routes it through
    // the migration gate rather than applying it.
    touchesSchema: Boolean(input.touchesSchema),
    requestedBy: input.requestedBy ?? null
  })
}

// Wraps a provider's raw text into a proposal record with provenance. The
// digest binds later approval to this exact content, same as migrations.
export function wrapProposal(request, raw, { providerName }) {
  if (!raw || typeof raw !== 'object') {
    throw new CodeProviderError('provider returned no proposal', { field: 'proposal' })
  }
  if (typeof raw.code !== 'string' || raw.code.trim() === '') {
    throw new CodeProviderError('provider proposal has no code', { field: 'proposal.code' })
  }
  if (!CODE_LANGUAGES.includes(raw.language)) {
    throw new CodeProviderError(`proposal.language must be one of ${CODE_LANGUAGES.join(', ')}`, {
      field: 'proposal.language'
    })
  }

  return Object.freeze({
    id: crypto.randomUUID(),
    provider: providerName,
    task: request.task,
    language: raw.language,
    code: raw.code,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    touchesSchema: request.touchesSchema,
    requestedBy: request.requestedBy,
    digest: crypto.createHash('sha256').update(raw.code).digest('hex'),
    // Never true. Proposals are text until a gate approves them.
    applied: false,
    createdAt: new Date().toISOString()
  })
}

export const stubCodeProvider = Object.freeze({
  name: 'stub',
  available: false,
  async propose() {
    throw new CodeModelNotConfiguredError('stub', 'no code-generation model is connected')
  }
})

export class CodeProviderRegistry {
  #providers = new Map()
  #active = null

  register(provider) {
    const valid = validateCodeProvider(provider)
    if (this.#providers.has(valid.name)) {
      throw new CodeProviderError(`code provider "${valid.name}" is already registered`, { field: 'codeProvider.name' })
    }
    this.#providers.set(valid.name, valid)
    if (this.#active === null && valid.available) this.#active = valid.name
    return valid
  }

  use(name) {
    const provider = this.#providers.get(name)
    if (!provider) throw new CodeProviderError(`No code provider named "${name}"`, { field: 'codeProvider' })
    if (!provider.available) {
      throw new CodeModelNotConfiguredError(name, 'provider reports available: false')
    }
    this.#active = name
    return provider
  }

  active() {
    return this.#active === null ? null : this.#providers.get(this.#active)
  }

  list() {
    return [...this.#providers.values()].map((provider) => ({
      name: provider.name,
      available: provider.available,
      active: provider.name === this.#active
    }))
  }

  // Produces an untrusted proposal. Does not apply anything.
  async propose(requestInput) {
    const request = buildCodeRequest(requestInput)
    const provider = this.active()
    if (!provider) {
      throw new CodeModelNotConfiguredError('none', 'no available code provider is registered')
    }

    const raw = await provider.propose(request)
    return wrapProposal(request, raw, { providerName: provider.name })
  }
}
