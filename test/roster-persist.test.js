import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Roster, RosterError, ROSTER_SEED, loadRoster, saveRoster, recordMetric, rosterFromRows } from '../src/index.js'

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'roster.json')
const reading = (value, asOf) => ({ source: 'spotify', metricType: 'monthly_listeners', value, asOf })

test('a missing roster file yields the seed with no invented metrics', () => {
  const roster = loadRoster(tmpFile())
  assert.equal(roster.list().length, ROSTER_SEED.length)
  assert.ok(roster.list().every((a) => a.metrics.length === 0))
})

test('a corrupt roster file throws instead of silently falling back to the seed', () => {
  const file = tmpFile()
  fs.writeFileSync(file, '{ not json')
  assert.throws(() => loadRoster(file), RosterError)
  fs.writeFileSync(file, JSON.stringify({ nope: [] }))
  assert.throws(() => loadRoster(file), /"artists" array/)
})

test('recordMetric persists a sourced reading across loads', () => {
  const file = tmpFile()
  recordMetric(file, 'Freezzo', reading(1200, '2026-10-01T00:00:00.000Z'))
  const reloaded = loadRoster(file)
  assert.equal(reloaded.get('Freezzo').metrics.length, 1)
  assert.equal(reloaded.hasMetric('Freezzo'), true)
})

test('addMetric validates: unknown artist, bad source, and duplicates are refused and nothing is written', () => {
  const file = tmpFile()
  assert.throws(() => recordMetric(file, 'Nobody', reading(1, '2026-10-01T00:00:00.000Z')), /unknown artist/)
  assert.throws(
    () => recordMetric(file, 'Freezzo', { ...reading(1, '2026-10-01T00:00:00.000Z'), source: 'guess' }),
    RosterError
  )
  assert.equal(fs.existsSync(file), false, 'a refused reading must not create the file')

  recordMetric(file, 'Freezzo', reading(5, '2026-10-01T00:00:00.000Z'))
  assert.throws(() => recordMetric(file, 'Freezzo', reading(6, '2026-10-01T00:00:00.000Z')), /duplicate/)
})

test('aggregate uses the latest reading per artist, not the first recorded', () => {
  const roster = Roster.from(ROSTER_SEED)
  for (const artist of roster.list()) {
    roster.addMetric(artist.name, reading(10, '2026-01-01T00:00:00.000Z'))
  }
  roster.addMetric('Freezzo', reading(50, '2026-09-01T00:00:00.000Z'))

  const agg = roster.aggregate({ metricType: 'monthly_listeners', source: 'spotify' })
  assert.equal(agg.complete, true)
  assert.equal(agg.total, 50 + 10 * 4)
  // Oldest of the latest readings bounds freshness.
  assert.equal(agg.asOf, '2026-01-01T00:00:00.000Z')
})

test('aggregate stays incomplete (total null) until every artist reports', () => {
  const file = tmpFile()
  recordMetric(file, 'Freezzo', reading(5, '2026-10-01T00:00:00.000Z'))
  const agg = loadRoster(file).aggregate({ metricType: 'monthly_listeners', source: 'spotify' })
  assert.equal(agg.complete, false)
  assert.equal(agg.total, null)
})

test('saveRoster leaves no temp files behind', () => {
  const file = tmpFile()
  saveRoster(Roster.from(ROSTER_SEED), file)
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['roster.json'])
})

test('rosterFromRows maps Supabase rows and rejects metrics for unknown artists', () => {
  const roster = rosterFromRows({
    artists: [{ name: 'Freezzo', role: 'core', spotify_id: '4ksrusI7XnIdyuN6a3LtMj' }],
    metrics: [{ artist_name: 'Freezzo', source: 'spotify', metric_type: 'monthly_listeners', value: '77', as_of: '2026-10-01T00:00:00Z' }]
  })
  assert.equal(roster.get('Freezzo').spotifyUrl, 'https://open.spotify.com/artist/4ksrusI7XnIdyuN6a3LtMj')
  assert.equal(roster.get('Freezzo').metrics[0].value, 77)

  assert.throws(
    () => rosterFromRows({ artists: [], metrics: [{ artist_name: 'Ghost', source: 'spotify', metric_type: 'x', value: 1, as_of: '2026-10-01T00:00:00Z' }] }),
    /unknown artist/
  )
})
