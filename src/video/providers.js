// Da'Riyah provider adapter interface.
//
// The Visual Engine builds scene plans, prompts and render jobs. Turning a
// scene into actual video frames requires an external model. That model is
// reached through a PROVIDER - an object implementing the contract below.
//
// No provider in this repo produces video. `stubProvider` deliberately throws.
// The contract exists so that when you have an API key or a GPU box, adding a
// provider is one file, and every provider is held to the same shape and
// validated the same way.

import { VideoError } from './index.js'

// What a provider must expose. Adding one means satisfying this and nothing else.
export const PROVIDER_CONTRACT = Object.freeze({
  // Human-readable name, used in job records.
  name: 'string',
  // Whether this provider can actually produce frames right now.
  available: 'boolean',
  // generateClip(request) -> Promise<{ outputKey, mimeType, durationSeconds }>
  generateClip: 'function'
})

export class ProviderNotConfiguredError extends VideoError {
  constructor(providerName, reason) {
    super(`${providerName} provider is not configured: ${reason}`, {
      field: 'provider',
      provider: providerName,
      implemented: false
    })
    this.name = 'ProviderNotConfiguredError'
  }
}

// Validates a provider before it is registered. Catches a malformed adapter at
// registration rather than at render time, when a job is already queued.
export function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new VideoError('provider must be an object', { field: 'provider' })
  }

  for (const [key, type] of Object.entries(PROVIDER_CONTRACT)) {
    if (typeof provider[key] !== type) {
      throw new VideoError(`provider.${key} must be a ${type}`, { field: `provider.${key}` })
    }
  }

  return provider
}

// The request shape every provider receives. Documented here because it is the
// boundary between this codebase and whatever model you connect.
export function buildClipRequest(scene, { style, outputKey } = {}) {
  if (!scene || typeof scene !== 'object') {
    throw new VideoError('scene must be an object', { field: 'scene' })
  }
  if (typeof scene.prompt !== 'string' || scene.prompt.trim() === '') {
    throw new VideoError('scene.prompt is required', { field: 'scene.prompt' })
  }

  const duration = Number(scene.endAt) - Number(scene.startAt)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new VideoError('scene must have a positive duration', { field: 'scene.duration' })
  }

  return Object.freeze({
    prompt: scene.prompt,
    style: style ?? null,
    // Source frame, if the artist supplied one. Null means text-to-video.
    image: scene.sourceImage ?? null,
    durationSeconds: Number(duration.toFixed(3)),
    transition: scene.transition ?? 'cut',
    outputKey: outputKey ?? null
  })
}

// The only provider shipped. It exists so the registry, the validation and the
// job wiring can be tested without a model, and so an unconfigured deployment
// fails loudly instead of returning placeholder video.
export const stubProvider = Object.freeze({
  name: 'stub',
  available: false,
  async generateClip() {
    throw new ProviderNotConfiguredError('stub', 'no video model is connected')
  }
})

export class ProviderRegistry {
  #providers = new Map()
  #active = null

  register(provider) {
    const valid = validateProvider(provider)
    if (this.#providers.has(valid.name)) {
      throw new VideoError(`provider "${valid.name}" is already registered`, { field: 'provider.name' })
    }
    this.#providers.set(valid.name, valid)

    // First available provider wins; an unavailable one is never selected.
    if (this.#active === null && valid.available) this.#active = valid.name

    return valid
  }

  use(name) {
    const provider = this.#providers.get(name)
    if (!provider) throw new VideoError(`No provider named "${name}"`, { field: 'provider' })
    if (!provider.available) {
      throw new ProviderNotConfiguredError(name, 'provider reports available: false')
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

  // Renders every scene in a job through the active provider. Fails before
  // doing any work if no provider is usable, rather than partway through.
  async renderJob(job) {
    const provider = this.active()
    if (!provider) {
      throw new ProviderNotConfiguredError('none', 'no available provider is registered')
    }

    const clips = []
    for (const scene of job.scenes) {
      const request = buildClipRequest(scene, { style: job.style, outputKey: null })
      const clip = await provider.generateClip(request)
      clips.push({ sceneId: scene.id, ...clip })
    }

    return clips
  }
}
