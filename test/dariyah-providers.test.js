import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  ProviderRegistry,
  ProviderNotConfiguredError,
  PROVIDER_CONTRACT,
  buildClipRequest,
  validateProvider,
  stubProvider,
  RenderQueue,
  createVideoProject,
  renderFrames,
  VideoError
} from '../src/index.js'

function fakeProvider(overrides = {}) {
  return {
    name: 'fake',
    available: true,
    generateClip: async (request) => ({
      outputKey: `renders/${request.outputKey ?? 'clip'}.mp4`,
      mimeType: 'video/mp4',
      durationSeconds: request.durationSeconds
    }),
    ...overrides
  }
}

function tempQueue() {
  return new RenderQueue(fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-dariyah-')))
}

test('the provider contract declares exactly the three required members', () => {
  assert.deepEqual(Object.keys(PROVIDER_CONTRACT).sort(), ['available', 'generateClip', 'name'])
})

test('a provider missing a contract member is rejected at registration', () => {
  assert.throws(() => validateProvider({ name: 'x', available: true }), /generateClip/)
  assert.throws(() => validateProvider({ name: 'x', generateClip: async () => { } }), /available/)
  assert.throws(() => validateProvider(null), /provider must be an object/)
})

test('the stub provider is registered but unavailable, so nothing can render', async () => {
  const registry = new ProviderRegistry()
  registry.register(stubProvider)

  assert.equal(registry.active(), null)
  assert.deepEqual(registry.list(), [{ name: 'stub', available: false, active: false }])
  await assert.rejects(() => registry.renderJob({ scenes: [], style: 'street' }), ProviderNotConfiguredError)
})

test('using an unavailable provider reports why', () => {
  const registry = new ProviderRegistry()
  registry.register(stubProvider)

  assert.throws(() => registry.use('stub'), /available: false/)
  assert.throws(() => registry.use('nonexistent'), /No provider named/)
})

test('registering an available provider makes it active automatically', async () => {
  const registry = new ProviderRegistry()
  registry.register(stubProvider)
  registry.register(fakeProvider({ name: 'real' }))

  assert.equal(registry.active().name, 'real')
  assert.equal(registry.list().find((p) => p.name === 'real').active, true)
})

test('a provider cannot be registered twice', () => {
  const registry = new ProviderRegistry()
  registry.register(fakeProvider())

  assert.throws(() => registry.register(fakeProvider()), /already registered/)
})

test('a clip request carries prompt, duration and the source image', () => {
  const request = buildClipRequest(
    { prompt: 'scene one', sourceImage: 'a.jpg', startAt: 0, endAt: 8, transition: 'cut' },
    { style: 'street' }
  )

  assert.equal(request.prompt, 'scene one')
  assert.equal(request.image, 'a.jpg')
  assert.equal(request.durationSeconds, 8)
  assert.equal(request.style, 'street')
})

test('a clip request without a prompt or duration is rejected', () => {
  assert.throws(() => buildClipRequest({ startAt: 0, endAt: 8 }), /scene\.prompt/)
  assert.throws(() => buildClipRequest({ prompt: 'x', startAt: 8, endAt: 8 }), /positive duration/)
  assert.throws(() => buildClipRequest(null), /scene must be an object/)
})

test('a scene with no source image produces a text-to-video request', () => {
  const request = buildClipRequest({ prompt: 'x', sourceImage: null, startAt: 0, endAt: 4 })
  assert.equal(request.image, null)
})

test('renderJob asks the provider for one clip per scene', async () => {
  const registry = new ProviderRegistry()
  const seen = []
  registry.register(
    fakeProvider({
      generateClip: async (request) => {
        seen.push(request.prompt)
        return { outputKey: 'out.mp4', mimeType: 'video/mp4', durationSeconds: request.durationSeconds }
      }
    })
  )

  const project = createVideoProject({ title: 'T', style: 'street', bpm: 120, durationSeconds: 16 })
  const job = tempQueue().enqueue(project, { barsPerCut: 4 })
  const clips = await registry.renderJob(job)

  assert.equal(clips.length, job.scenes.length)
  assert.equal(seen.length, job.scenes.length)
  assert.ok(clips[0].sceneId)
})

test('renderFrames delegates to the registry and needs one', async () => {
  const project = createVideoProject({ title: 'T', style: 'dark', bpm: 120, durationSeconds: 8 })
  const job = tempQueue().enqueue(project, { barsPerCut: 4 })

  await assert.rejects(() => renderFrames(job), VideoError)
  await assert.rejects(() => renderFrames(job), /requires a provider registry/)

  const registry = new ProviderRegistry()
  registry.register(fakeProvider())
  const clips = await renderFrames(job, registry)
  assert.equal(clips.length, job.scenes.length)
})
