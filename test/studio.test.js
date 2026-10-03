import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { StudioStore, StudioError, processAudio } from '../src/index.js'

function tempStore() {
  return new StudioStore(fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-studio-')))
}

test('a session requires a title and starts empty', () => {
  const store = tempStore()

  assert.throws(() => store.create({}), StudioError)

  const session = store.create({ title: 'Midnight Echo', artistName: 'Big Homie Cash' })
  assert.match(session.id, /^[0-9a-f-]{36}$/)
  assert.equal(session.status, 'draft')
  assert.deepEqual(session.tracks, [])
})

test('tracks are validated: kind, gain and pan are bounded', () => {
  const store = tempStore()
  const session = store.create({ title: 'Bounds' })

  assert.throws(() => store.addTrack(session.id, { name: 'x', kind: 'kazoo' }), /track\.kind/)
  assert.throws(() => store.addTrack(session.id, { name: 'x', kind: 'vocals', gain: 5 }), /track\.gain/)
  assert.throws(() => store.addTrack(session.id, { name: 'x', kind: 'vocals', pan: -3 }), /track\.pan/)
})

test('adding a track persists it and bumps the version history', () => {
  const store = tempStore()
  const session = store.create({ title: 'Versions' })

  const after = store.addTrack(session.id, { name: 'Lead vocal', kind: 'vocals', duration: 30 })

  assert.equal(after.tracks.length, 1)
  assert.ok(after.versions.length >= 2)
  assert.equal(after.versions.at(-1).trackCount, 1)
})

test('a mix change is saved and recorded as a new version', () => {
  const store = tempStore()
  const session = store.create({ title: 'Mix' })
  const withTrack = store.addTrack(session.id, { name: 'Beat', kind: 'beat' })
  const trackId = withTrack.tracks[0].id

  const updated = store.updateTrack(session.id, trackId, { gain: 0.8 })

  assert.equal(updated.tracks[0].gain, 0.8)
  assert.equal(updated.versions.at(-1).mix[0].gain, 0.8)
})

test('a track can be muted and removed', () => {
  const store = tempStore()
  const session = store.create({ title: 'Mute' })
  const withTrack = store.addTrack(session.id, { name: 'Adlibs', kind: 'adlibs' })
  const trackId = withTrack.tracks[0].id

  assert.equal(store.updateTrack(session.id, trackId, { muted: true }).tracks[0].muted, true)
  assert.equal(store.removeTrack(session.id, trackId).tracks.length, 0)
  assert.throws(() => store.removeTrack(session.id, trackId), /No track with id/)
})

test('sessions survive a store restart, and corrupt files are skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-reload-'))
  const first = new StudioStore(dir)
  const session = first.create({ title: 'Persisted' })
  first.addTrack(session.id, { name: 'Beat', kind: 'beat' })

  fs.writeFileSync(path.join(dir, 'garbage.json'), '{ not json')

  const second = new StudioStore(dir)
  assert.equal(second.list().length, 1)
  assert.equal(second.get(session.id).tracks.length, 1)
})

test('mix validation flags a session with no vocals and an unattached track', () => {
  const store = tempStore()
  const session = store.create({ title: 'Checks' })
  const withBeat = store.addTrack(session.id, { name: 'Beat', kind: 'beat' })

  const result = store.validateMix(session.id)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => /No vocal track/.test(issue)))
  assert.ok(result.issues.some((issue) => /no audio attached/.test(issue)))
  assert.equal(withBeat.tracks[0].sourceKey, null)
})

test('a healthy session passes mix validation', () => {
  const store = tempStore()
  const session = store.create({ title: 'Good' })
  const withBeat = store.addTrack(session.id, { name: 'Beat', kind: 'beat', gain: 0.9, sourceKey: 'bucket/beat.wav' })
  store.addTrack(session.id, { name: 'Vocal', kind: 'vocals', gain: 1, sourceKey: 'bucket/vocal.wav' })

  assert.equal(withBeat.tracks.length, 1)
  assert.equal(store.validateMix(session.id).ok, true)
})

test('export is refused for an empty session and returns a manifest otherwise', () => {
  const store = tempStore()
  const session = store.create({ title: 'Export' })

  assert.throws(() => store.exportManifest(session.id), /no tracks/)

  store.addTrack(session.id, { name: 'Vocal', kind: 'vocals', startAt: 10, duration: 20 })
  const manifest = store.exportManifest(session.id)

  assert.equal(manifest.sessionId, session.id)
  assert.equal(manifest.tracks.length, 1)
  assert.equal(manifest.runtime, 30)
})

test('server-side audio processing is unimplemented and says so', () => {
  assert.throws(() => processAudio(), /not implemented/)
  assert.throws(() => processAudio(), (error) => {
    assert.equal(error.name, 'StudioError')
    assert.equal(error.field, 'processAudio')
    assert.equal(error.implemented, false)
    return true
  })
})
