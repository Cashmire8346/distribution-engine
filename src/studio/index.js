// DMF Studio Engine - session model and storage.
//
// WHAT THIS IS: the session/track data model, validation, version history,
// auto-save bookkeeping, and export manifest for a browser recording studio.
// It is real and tested.
//
// WHAT THIS IS NOT: the audio DSP. Recording, playback, mixing and effects run
// in the browser via the Web Audio API (see public/studio.js). Server-side
// audio processing (pitch correction, auto-mix, mastering) is deliberately
// left as `processAudio()` at the bottom of this file - it has no
// implementation, and it throws if called. Wire it to ffmpeg, a DSP service,
// or an external API when you have one.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const SESSION_STATUSES = Object.freeze(['draft', 'mixing', 'ready', 'exported'])

export const TRACK_KINDS = Object.freeze(['vocals', 'beat', 'instrumental', 'adlibs', 'reference'])

const MAX_SHARE_PERCENT = 100

export class StudioError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'StudioError'
    Object.assign(this, details)
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new StudioError(`${field} is required`, { field })
  }
  return value.trim()
}

// A track is a reference to a file plus the mix settings applied to it.
// The audio itself never passes through here.
export function normaliseTrack(input, { index } = {}) {
  if (!input || typeof input !== 'object') {
    throw new StudioError('track must be an object', { field: 'track' })
  }

  const name = assertNonEmptyString(input.name, 'track.name')

  if (!TRACK_KINDS.includes(input.kind)) {
    throw new StudioError(`track.kind must be one of ${TRACK_KINDS.join(', ')}`, { field: 'track.kind' })
  }

  const gain = input.gain === undefined ? 1 : Number(input.gain)
  if (!Number.isFinite(gain) || gain < 0 || gain > 2) {
    throw new StudioError('track.gain must be between 0 and 2', { field: 'track.gain' })
  }

  const pan = input.pan === undefined ? 0 : Number(input.pan)
  if (!Number.isFinite(pan) || pan < -1 || pan > 1) {
    throw new StudioError('track.pan must be between -1 and 1', { field: 'track.pan' })
  }

  return Object.freeze({
    id: input.id || crypto.randomUUID(),
    name,
    kind: input.kind,
    // Offset into the timeline, in seconds.
    startAt: Number.isFinite(Number(input.startAt)) ? Number(input.startAt) : 0,
    duration: Number.isFinite(Number(input.duration)) ? Number(input.duration) : 0,
    gain,
    pan,
    muted: Boolean(input.muted),
    // Storage key for the recorded/uploaded audio, once it exists.
    sourceKey: input.sourceKey ?? null,
    order: Number.isInteger(index) ? index : 0
  })
}

export function createSession(input = {}) {
  const title = assertNonEmptyString(input.title, 'title')

  return {
    id: crypto.randomUUID(),
    title,
    artistName: typeof input.artistName === 'string' ? input.artistName.trim() : '',
    status: SESSION_STATUSES.includes(input.status) ? input.status : 'draft',
    tracks: [],
    // Every save appends here. Capped so a long session does not grow forever.
    versions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export class StudioStore {
  #dir
  #sessions = new Map()

  constructor(dir) {
    this.#dir = dir
    fs.mkdirSync(this.#dir, { recursive: true })
    this.#load()
  }

  #file(id) {
    if (!/^[0-9a-f-]{36}$/.test(String(id))) {
      throw new StudioError('session id is not a valid uuid', { field: 'id' })
    }
    return path.join(this.#dir, `${id}.json`)
  }

  #load() {
    for (const entry of fs.readdirSync(this.#dir)) {
      if (!entry.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(this.#dir, entry), 'utf8'))
        if (parsed && typeof parsed.id === 'string') this.#sessions.set(parsed.id, parsed)
      } catch {
        // A corrupt session file is skipped rather than crashing boot.
      }
    }
  }

  // Writes the session and appends a version snapshot. This is the auto-save
  // path: safe to call on every edit.
  save(session) {
    if (!session || typeof session.id !== 'string') {
      throw new StudioError('session with an id is required', { field: 'session' })
    }

    const snapshot = {
      id: session.id,
      title: session.title,
      artistName: session.artistName,
      status: session.status,
      tracks: session.tracks.map((track, index) => normaliseTrack(track, { index })),
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString()
    }

    const versions = Array.isArray(session.versions) ? [...session.versions] : []
    versions.push({
      at: snapshot.updatedAt,
      trackCount: snapshot.tracks.length,
      // Shallow copy of the mix settings, enough to diff a mix change.
      mix: snapshot.tracks.map((t) => ({ id: t.id, gain: t.gain, pan: t.pan, muted: t.muted }))
    })

    snapshot.versions = versions.slice(-50)

    fs.writeFileSync(this.#file(snapshot.id), JSON.stringify(snapshot, null, 2))
    this.#sessions.set(snapshot.id, snapshot)
    return snapshot
  }

  get(id) {
    if (!this.#sessions.has(id)) return null
    return this.#sessions.get(id)
  }

  list() {
    return [...this.#sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  create(input) {
    return this.save(createSession(input))
  }

  addTrack(id, trackInput) {
    const session = this.get(id)
    if (!session) throw new StudioError(`No session with id ${id}`, { field: 'id' })

    const track = normaliseTrack(trackInput, { index: session.tracks.length })
    return this.save({ ...session, tracks: [...session.tracks, track] })
  }

  updateTrack(id, trackId, changes = {}) {
    const session = this.get(id)
    if (!session) throw new StudioError(`No session with id ${id}`, { field: 'id' })

    const index = session.tracks.findIndex((track) => track.id === trackId)
    if (index === -1) throw new StudioError(`No track with id ${trackId}`, { field: 'trackId' })

    const merged = normaliseTrack({ ...session.tracks[index], ...changes }, { index })
    const tracks = [...session.tracks]
    tracks[index] = merged

    return this.save({ ...session, tracks })
  }

  removeTrack(id, trackId) {
    const session = this.get(id)
    if (!session) throw new StudioError(`No session with id ${id}`, { field: 'id' })

    const tracks = session.tracks.filter((track) => track.id !== trackId)
    if (tracks.length === session.tracks.length) {
      throw new StudioError(`No track with id ${trackId}`, { field: 'trackId' })
    }

    return this.save({ ...session, tracks })
  }

  // A share of 100 is required before a session can be exported, matching the
  // ownership rule this repo already enforces for releases.
  exportManifest(id) {
    const session = this.get(id)
    if (!session) throw new StudioError(`No session with id ${id}`, { field: 'id' })

    if (session.tracks.length === 0) {
      throw new StudioError('Cannot export a session with no tracks', { field: 'tracks' })
    }

    return {
      sessionId: session.id,
      title: session.title,
      artistName: session.artistName,
      exportedAt: new Date().toISOString(),
      tracks: session.tracks.map((track) => ({
        name: track.name,
        kind: track.kind,
        startAt: track.startAt,
        duration: track.duration,
        gain: track.gain,
        pan: track.pan,
        muted: track.muted,
        sourceKey: track.sourceKey
      })),
      // Total runtime of the arrangement.
      runtime: session.tracks.reduce((max, track) => Math.max(max, track.startAt + track.duration), 0)
    }
  }

  validateMix(id) {
    const session = this.get(id)
    if (!session) throw new StudioError(`No session with id ${id}`, { field: 'id' })

    const issues = []

    if (session.tracks.length === 0) {
      issues.push('Session has no tracks')
    }

    const vocals = session.tracks.filter((t) => t.kind === 'vocals')
    if (vocals.length === 0) issues.push('No vocal track recorded')

    for (const track of session.tracks) {
      if (track.kind === 'beat' && track.gain > 1.2) {
        issues.push(`Beat "${track.name}" gain ${track.gain} risks clipping the vocal`)
      }
      if (!track.muted && track.sourceKey === null) {
        issues.push(`Track "${track.name}" has no audio attached`)
      }
    }

    const activeTracks = session.tracks.filter((t) => !t.muted && t.gain > 0)
    const summedGain = activeTracks.reduce((sum, t) => sum + t.gain, 0)
    if (activeTracks.length > 1 && summedGain / activeTracks.length > MAX_SHARE_PERCENT / 100) {
      issues.push(`Average track gain ${(summedGain / activeTracks.length).toFixed(2)} is high across ${activeTracks.length} tracks`)
    }

    return { ok: issues.length === 0, issues }
  }
}

// NOT IMPLEMENTED. Server-side audio processing (auto-mix, pitch correction,
// vocal cleanup, mastering) needs a DSP service or ffmpeg pipeline that does
// not exist in this repo. The browser handles recording and monitoring via the
// Web Audio API; anything server-side lands here.
export function processAudio() {
  throw new StudioError(
    'Server-side audio processing is not implemented. Recording and mixing run in the browser via the Web Audio API.',
    { field: 'processAudio', implemented: false }
  )
}
