// Da'Riyah - DMF AI Visual Engine.
//
// Video project model, style presets, scene planning and render queue.
//
// WHAT THIS IS: the project/scene data model, shot planning from audio
// structure, beat-to-cut mapping, style presets, a render queue with job
// states, and an export manifest. All real and tested.
//
// WHAT THIS IS NOT: the generative video model. `renderFrames()` at the bottom
// of this file has no implementation and throws if called. Generating frames
// requires a video diffusion model or a hosted API (Sora, Runway, Luma,
// Stable Video Diffusion on your own GPU) - none of which exist in this repo.
// The pipeline around it - scenes, timings, prompts, queueing, progress,
// retries, output - is built and works.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Style presets. `promptFragment` is the string a video model would receive -
// the pipeline composes it, this file does not generate the video.
export const STYLE_PRESETS = Object.freeze({
  cinematic: { label: 'Cinematic', promptFragment: 'anamorphic lens, shallow depth of field, film grain, dramatic key light' },
  street: { label: 'Street', promptFragment: 'handheld camera, urban night, sodium streetlights, raw documentary texture' },
  anime: { label: 'Anime', promptFragment: 'cel-shaded anime, dynamic linework, saturated palette, speed lines' },
  dark: { label: 'Dark', promptFragment: 'low-key lighting, deep shadows, desaturated, smoke haze' },
  luxury: { label: 'Luxury', promptFragment: 'high-gloss, chrome and marble, soft rim light, slow elegant camera moves' },
  vintage: { label: 'Vintage', promptFragment: '16mm film, warm halation, soft focus, period colour grade' }
})

export const JOB_STATES = Object.freeze(['queued', 'planning', 'rendering', 'stitching', 'done', 'failed'])

export class VideoError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'VideoError'
    Object.assign(this, details)
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new VideoError(`${field} is required`, { field })
  }
  return value.trim()
}

// Maps a beat grid to scene cut points. Given beats-per-minute and a target
// number of bars per scene, returns the cut times in seconds. This is what
// drives "auto scene switching on the beat".
export function planCuts({ bpm, durationSeconds, barsPerCut = 4, beatsPerBar = 4 }) {
  const tempo = Number(bpm)
  if (!Number.isFinite(tempo) || tempo <= 0 || tempo > 400) {
    throw new VideoError('bpm must be a number between 0 and 400', { field: 'bpm' })
  }

  const duration = Number(durationSeconds)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new VideoError('durationSeconds must be a positive number', { field: 'durationSeconds' })
  }
  if (!Number.isInteger(barsPerCut) || barsPerCut < 1) {
    throw new VideoError('barsPerCut must be a positive integer', { field: 'barsPerCut' })
  }

  const secondsPerBeat = 60 / tempo
  const secondsPerCut = secondsPerBeat * beatsPerBar * barsPerCut

  const cuts = []
  for (let t = 0; t < duration; t += secondsPerCut) {
    cuts.push({
      startAt: Number(t.toFixed(3)),
      endAt: Number(Math.min(t + secondsPerCut, duration).toFixed(3)),
      bar: Math.round(t / (secondsPerBeat * beatsPerBar)) + 1
    })
  }

  return cuts
}

export function createVideoProject(input = {}) {
  const title = assertString(input.title, 'title')

  if (!STYLE_PRESETS[input.style]) {
    throw new VideoError(`style must be one of ${Object.keys(STYLE_PRESETS).join(', ')}`, { field: 'style' })
  }

  return {
    id: crypto.randomUUID(),
    title,
    artistName: typeof input.artistName === 'string' ? input.artistName.trim() : '',
    style: input.style,
    bpm: Number.isFinite(Number(input.bpm)) ? Number(input.bpm) : 120,
    durationSeconds: Number.isFinite(Number(input.durationSeconds)) ? Number(input.durationSeconds) : 0,
    // Source images the artist supplied. Frames are generated FROM these.
    sourceImages: Array.isArray(input.sourceImages) ? input.sourceImages.filter((s) => typeof s === 'string') : [],
    scenes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

// Builds scenes from the beat grid. Each scene carries the composed prompt
// that a generative model would be given.
export function buildScenes(project, { barsPerCut = 4 } = {}) {
  const cuts = planCuts({
    bpm: project.bpm,
    durationSeconds: project.durationSeconds,
    barsPerCut
  })

  const preset = STYLE_PRESETS[project.style]
  const images = project.sourceImages

  return cuts.map((cut, index) => ({
    id: crypto.randomUUID(),
    index,
    startAt: cut.startAt,
    endAt: cut.endAt,
    duration: Number((cut.endAt - cut.startAt).toFixed(3)),
    bar: cut.bar,
    // Round-robins the supplied images so each scene has a source frame.
    sourceImage: images.length > 0 ? images[index % images.length] : null,
    prompt: `${project.title} - scene ${index + 1}, ${preset.promptFragment}`,
    transition: index % 2 === 0 ? 'cut' : 'dissolve'
  }))
}

export class RenderQueue {
  #dir
  #jobs = new Map()

  constructor(dir) {
    this.#dir = dir
    fs.mkdirSync(this.#dir, { recursive: true })
    this.#load()
  }

  #file(id) {
    if (!/^[0-9a-f-]{36}$/.test(String(id))) {
      throw new VideoError('job id is not a valid uuid', { field: 'id' })
    }
    return path.join(this.#dir, `${id}.json`)
  }

  #load() {
    for (const entry of fs.readdirSync(this.#dir)) {
      if (!entry.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(this.#dir, entry), 'utf8'))
        if (parsed && typeof parsed.id === 'string') this.#jobs.set(parsed.id, parsed)
      } catch {
        // Skip a corrupt job file rather than failing boot.
      }
    }
  }

  #persist(job) {
    fs.writeFileSync(this.#file(job.id), JSON.stringify(job, null, 2))
    this.#jobs.set(job.id, job)
    return job
  }

  enqueue(project, { barsPerCut = 4 } = {}) {
    const scenes = buildScenes(project, { barsPerCut })

    const job = {
      id: crypto.randomUUID(),
      projectId: project.id,
      title: project.title,
      style: project.style,
      state: 'queued',
      scenes,
      // Frames are produced by renderFrames(); nothing is faked here.
      renderedFrames: 0,
      totalFrames: scenes.length,
      outputKey: null,
      error: null,
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return this.#persist(job)
  }

  get(id) {
    return this.#jobs.get(id) ?? null
  }

  list() {
    return [...this.#jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  advance(id, state, patch = {}) {
    const job = this.get(id)
    if (!job) throw new VideoError(`No job with id ${id}`, { field: 'id' })
    if (!JOB_STATES.includes(state)) {
      throw new VideoError(`state must be one of ${JOB_STATES.join(', ')}`, { field: 'state' })
    }

    return this.#persist({ ...job, ...patch, state, updatedAt: new Date().toISOString() })
  }

  fail(id, message) {
    const job = this.get(id)
    if (!job) throw new VideoError(`No job with id ${id}`, { field: 'id' })

    return this.#persist({
      ...job,
      state: 'failed',
      error: String(message),
      attempts: job.attempts + 1,
      updatedAt: new Date().toISOString()
    })
  }

  // Progress as the renderer reports frames. Returns 0-100.
  progress(id) {
    const job = this.get(id)
    if (!job) throw new VideoError(`No job with id ${id}`, { field: 'id' })
    if (job.totalFrames === 0) return 0
    return Math.round((job.renderedFrames / job.totalFrames) * 100)
  }

  exportManifest(id) {
    const job = this.get(id)
    if (!job) throw new VideoError(`No job with id ${id}`, { field: 'id' })

    if (job.state !== 'done') {
      throw new VideoError(`Cannot export a job in state "${job.state}"`, { field: 'state' })
    }
    if (!job.outputKey) {
      throw new VideoError('Job is marked done but has no output file', { field: 'outputKey' })
    }

    return {
      jobId: job.id,
      title: job.title,
      style: job.style,
      outputKey: job.outputKey,
      sceneCount: job.scenes.length,
      runtime: job.scenes.reduce((max, scene) => Math.max(max, scene.endAt), 0),
      exportedAt: new Date().toISOString()
    }
  }
}

// Frame generation is delegated to a registered provider (see providers.js).
// No provider in this repo produces video, so this throws until one is
// registered and configured. The pipeline around it is implemented.
export async function renderFrames(job, registry) {
  if (!registry || typeof registry.renderJob !== 'function') {
    throw new VideoError('renderFrames requires a provider registry', {
      field: 'renderFrames',
      implemented: false
    })
  }
  return registry.renderJob(job)
}

export { assertString }
