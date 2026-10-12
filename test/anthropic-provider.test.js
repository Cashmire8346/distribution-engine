import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CodeProviderRegistry,
  CodeProviderError,
  createAnthropicCodeProvider,
  DEFAULT_ANTHROPIC_MODEL,
  validateCodeProvider
} from '../src/index.js'

const okResponse = (input) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'tool_use', name: 'submit_proposal', input }] })
})

test('without an API key the provider reports unavailable and the registry will not select it', () => {
  const provider = createAnthropicCodeProvider({ apiKey: '' })
  validateCodeProvider(provider)
  assert.equal(provider.available, false)

  const registry = new CodeProviderRegistry()
  registry.register(provider)
  assert.equal(registry.active(), null)
  assert.throws(() => registry.use('anthropic'), /not configured/)
})

test('with a key it is available and becomes the active provider', () => {
  const registry = new CodeProviderRegistry()
  registry.register(createAnthropicCodeProvider({ apiKey: 'k', fetchImpl: async () => okResponse({}) }))
  assert.equal(registry.active().name, 'anthropic')
})

test('sends a forced tool call with the key in a header, never in the body', async () => {
  let seen
  const provider = createAnthropicCodeProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) }
      return okResponse({ code: 'select 1;', language: 'sql', notes: 'n' })
    }
  })
  const registry = new CodeProviderRegistry()
  registry.register(provider)

  const proposal = await registry.propose({ task: 'a query', language: 'sql', touchesSchema: true })

  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(seen.init.headers['x-api-key'], 'sk-test-secret')
  assert.equal(seen.body.model, DEFAULT_ANTHROPIC_MODEL)
  assert.deepEqual(seen.body.tool_choice, { type: 'tool', name: 'submit_proposal' })
  assert.ok(!seen.init.body.includes('sk-test-secret'))

  // Output is untrusted text: never applied, bound to a digest.
  assert.equal(proposal.applied, false)
  assert.equal(proposal.provider, 'anthropic')
  assert.equal(proposal.touchesSchema, true)
  assert.match(proposal.digest, /^[0-9a-f]{64}$/)
})

test('HTTP errors, network errors, and malformed responses fail with CodeProviderError', async () => {
  const make = (fetchImpl) => {
    const r = new CodeProviderRegistry()
    r.register(createAnthropicCodeProvider({ apiKey: 'k', fetchImpl }))
    return r
  }

  await assert.rejects(
    () => make(async () => ({ ok: false, status: 429 })).propose({ task: 't' }),
    (e) => e instanceof CodeProviderError && e.status === 429
  )
  await assert.rejects(
    () => make(async () => { throw new Error('boom') }).propose({ task: 't' }),
    /request failed: boom/
  )
  await assert.rejects(
    () => make(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hi' }] }) })).propose({ task: 't' }),
    /no proposal/
  )
})

test('a model returning an unknown language or empty code is rejected by the registry', async () => {
  const r = new CodeProviderRegistry()
  r.register(createAnthropicCodeProvider({ apiKey: 'k', fetchImpl: async () => okResponse({ code: 'x', language: 'cobol' }) }))
  await assert.rejects(() => r.propose({ task: 't' }), /language must be one of/)

  const r2 = new CodeProviderRegistry()
  r2.register(createAnthropicCodeProvider({ apiKey: 'k', fetchImpl: async () => okResponse({ code: '  ', language: 'sql' }) }))
  await assert.rejects(() => r2.propose({ task: 't' }), /no code/)
})
