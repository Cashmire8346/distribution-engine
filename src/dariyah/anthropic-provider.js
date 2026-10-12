// Da'Riyah Engineering - Anthropic code provider.
//
// The first real implementation of CODE_PROVIDER_CONTRACT. It reaches the
// Anthropic Messages API and returns an UNTRUSTED proposal. It never executes
// or applies anything; CodeProviderRegistry wraps the result with applied:false
// and a digest, and schema changes still have to pass MigrationGate.
//
// `available` is true only when an API key is supplied. With no key this
// provider reports false and the registry will not select it, so the engine
// still fails closed in an unconfigured environment.

import { CODE_LANGUAGES, CodeProviderError } from './code.js'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

const SYSTEM_PROMPT = [
  'You write code for a record label distribution engine.',
  'Return exactly one proposal through the submit_proposal tool.',
  'Your output is reviewed by a human and is never executed automatically.',
  'Do not include secrets, credentials, or real personal data.',
  'For SQL that touches row level security, prefer deny-by-default policies and say so in notes.'
].join(' ')

const PROPOSAL_TOOL = Object.freeze({
  name: 'submit_proposal',
  description: 'Submit the proposed code.',
  input_schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'The complete code, with no markdown fences.' },
      language: { type: 'string', enum: [...CODE_LANGUAGES] },
      notes: { type: 'string', description: 'Assumptions and anything a reviewer should check.' }
    },
    required: ['code', 'language']
  }
})

function userMessage(request) {
  const parts = [`Task: ${request.task}`, `Language: ${request.language}`]
  if (request.touchesSchema) parts.push('This changes the database schema and will go through a migration approval gate.')
  if (request.context != null) {
    parts.push(`Context:\n${typeof request.context === 'string' ? request.context : JSON.stringify(request.context, null, 2)}`)
  }
  return parts.join('\n\n')
}

export function createAnthropicCodeProvider({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  maxTokens = 4096
} = {}) {
  const hasKey = typeof apiKey === 'string' && apiKey.trim() !== ''

  return Object.freeze({
    name: 'anthropic',
    available: hasKey && typeof fetchImpl === 'function',

    async propose(request) {
      if (!hasKey) throw new CodeProviderError('ANTHROPIC_API_KEY is not set', { field: 'apiKey' })

      let response
      try {
        response = await fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: SYSTEM_PROMPT,
            tools: [PROPOSAL_TOOL],
            tool_choice: { type: 'tool', name: PROPOSAL_TOOL.name },
            messages: [{ role: 'user', content: userMessage(request) }]
          }),
          signal: AbortSignal.timeout(timeoutMs)
        })
      } catch (error) {
        // The message is from fetch itself; the key is only ever in a header.
        throw new CodeProviderError(`Anthropic request failed: ${error.message}`, { field: 'network' })
      }

      if (!response.ok) {
        throw new CodeProviderError(`Anthropic API returned HTTP ${response.status}`, {
          field: 'http',
          status: response.status
        })
      }

      const body = await response.json()
      const block = Array.isArray(body?.content)
        ? body.content.find((b) => b.type === 'tool_use' && b.name === PROPOSAL_TOOL.name)
        : null
      if (!block || typeof block.input !== 'object' || block.input === null) {
        throw new CodeProviderError('Anthropic response contained no proposal', { field: 'proposal' })
      }

      return { code: block.input.code, language: block.input.language, notes: block.input.notes }
    }
  })
}
