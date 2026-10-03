import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  RenderQueue,
  VideoError,
  STYLE_PRESETS,
  planCuts,
  buildScenes,
  createVideoProject,
  renderFrames
} from '../src/index.js'

function tempQueue() {
  return new RenderQueue(fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-video-')))
}

test('cut planning maps a beat grid to scene boundaries', () => {
  // 120bpm = 0.5s per beat, 4 beats per bar, 4 bars per cut = 8s per cut.
  const cuts = planCuts({ bpm: 120, durationSeconds: 20, barsPerCut: 4 })

  assert.equal(cuts.length, 3)
  assert.equal(cuts[0].startAt, 0)
  assert.equal(cuts[0].endAt, 8)
  assert.equal(cuts[1].startAt, 8)
  // The final cut is trimmed to the track length, not padded past it.
  assert.equal(cuts[2].endAt, 20)
})

test('cut planning rejects nonsense tempo and duration', () => {
  assert.throws(() => planCuts({ bpm: 0, durationSeconds: 30 }), /bpm/)
  assert.throws(() => planCuts({ bpm: 500, durationSeconds: 30 }), /bpm/)
  assert.throws(() => planCuts({ bpm: 120, durationSeconds: 0 }), /durationSeconds/)
  assert.throws(() => planCuts({ bpm: 120, durationSeconds: 30, barsPerCut: 0 }), /barsPerCut/)
})

test('a project requires a title and a known style', () => {
  assert.throws(() => createVideoProject({ style: 'cinematic' }), /title/)
  assert.throws(() => createVideoProject({ title: 'x', style: 'vaporwave' }), /style/)
  assert.equal(Object.keys(STYLE_PRESETS).length, 6)
})

test('scenes carry a composed prompt and alternate transitions', () => {
  const project = createVideoProject({ title: 'Midnight Echo', style: 'street', bpm: 120, durationSeconds: 20 })
  const scenes = buildScenes(project, { barsPerCut: 4 })

  assert.equal(scenes.length, 3)
  assert.match(scenes[0].prompt, /Midnight Echo/)
  assert.match(scenes[0].prompt, /handheld camera/)
  assert.equal(scenes[0].transition, 'cut')
  assert.equal(scenes[1].transition, 'dissolve')
})

test('supplied images are distributed across scenes round-robin', () => {
  const project = createVideoProject({
    title: 'Imagery',
    style: 'dark',
    bpm: 120,
    durationSeconds: 24,
    sourceImages: ['a.jpg', 'b.jpg']
  })

  const scenes = buildScenes(project, { barsPerCut: 4 })

  assert.equal(scenes[0].sourceImage, 'a.jpg')
  assert.equal(scenes[1].sourceImage, 'b.jpg')
  assert.equal(scenes[2].sourceImage, 'a.jpg')
})

test('a scene with no supplied images has a null source, not a placeholder', () => {
  const project = createVideoProject({ title: 'Empty', style: 'anime', bpm: 100, durationSeconds: 10 })
  const scenes = buildScenes(project, { barsPerCut: 2 })

  assert.equal(scenes.every((scene) => scene.sourceImage === null), true)
})

test('a queued job starts queued with zero frames rendered', () => {
  const queue = tempQueue()
  const project = createVideoProject({ title: 'Queue', style: 'luxury', bpm: 120, durationSeconds: 16 })
  const job = queue.enqueue(project, { barsPerCut: 4 })

  assert.equal(job.state, 'queued')
  assert.equal(job.renderedFrames, 0)
  assert.equal(job.totalFrames, job.scenes.length)
  assert.equal(job.outputKey, null)
})

test('progress is computed from rendered frames', () => {
  const queue = tempQueue()
  const project = createVideoProject({ title: 'Progress', style: 'cinematic', bpm: 120, durationSeconds: 16 })
  const job = queue.enqueue(project, { barsPerCut: 4 })

  assert.equal(queue.progress(job.id), 0)
  queue.advance(job.id, 'rendering', { renderedFrames: job.totalFrames })
  assert.equal(queue.progress(job.id), 100)
})

test('an invalid state transition is rejected', () => {
  const queue = tempQueue()
  const job = queue.enqueue(createVideoProject({ title: 'States', style: 'dark', bpm: 90, durationSeconds: 10 }))

  assert.throws(() => queue.advance(job.id, 'exploded'), /state must be one of/)
})

test('a failed job records the error and increments attempts', () => {
  const queue = tempQueue()
  const job = queue.enqueue(createVideoProject({ title: 'Fail', style: 'street', bpm: 90, durationSeconds: 10 }))
  const failed = queue.fail(job.id, 'GPU unavailable')

  assert.equal(failed.state, 'failed')
  assert.equal(failed.error, 'GPU unavailable')
  assert.equal(failed.attempts, 1)
})

test('export is refused unless the job is done with an output file', () => {
  const queue = tempQueue()
  const project = createVideoProject({ title: 'Export', style: 'vintage', bpm: 120, durationSeconds: 16 })
  const job = queue.enqueue(project, { barsPerCut: 4 })

  assert.throws(() => queue.exportManifest(job.id), /Cannot export a job in state "queued"/)

  // Marked done without an output is still refused.
  queue.advance(job.id, 'done', { renderedFrames: job.totalFrames })
  assert.throws(() => queue.exportManifest(job.id), /no output file/)

  const finished = queue.advance(job.id, 'done', { outputKey: 'renders/final.mp4' })
  const manifest = queue.exportManifest(finished.id)

  assert.equal(manifest.outputKey, 'renders/final.mp4')
  assert.equal(manifest.sceneCount, job.scenes.length)
})

test('queued jobs survive a queue restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-video-reload-'))
  const first = new RenderQueue(dir)
  const job = first.enqueue(createVideoProject({ title: 'Persisted', style: 'street', bpm: 120, durationSeconds: 16 }))

  const second = new RenderQueue(dir)
  assert.equal(second.list().length, 1)
  assert.equal(second.get(job.id).title, 'Persisted')
})

test('frame rendering needs a provider registry and says so', async () => {
  await assert.rejects(() => renderFrames(), VideoError)
  await assert.rejects(() => renderFrames(), /requires a provider registry/)
})
