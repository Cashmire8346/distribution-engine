import test from 'node:test'
import assert from 'node:assert/strict'

import { Roster, ROSTER_SEED } from '../src/index.js'

test('toJSON carries the roster header and every artist', () => {
  const snapshot = Roster.from(ROSTER_SEED).toJSON()

  assert.match(snapshot.header, /DMF RECORDS FLY HOOLIE ENT/)
  assert.equal(snapshot.artists.length, 5)
  assert.equal(snapshot.artists[0].name, 'Big Homie Cash')
})

test('toJSON marks every artist as untracked while no metrics are sourced', () => {
  const snapshot = Roster.from(ROSTER_SEED).toJSON()

  assert.equal(snapshot.artists.every((artist) => artist.tracked === false), true)
  assert.equal(snapshot.aggregate.complete, false)
  assert.equal(snapshot.aggregate.total, null)
})

test('toJSON reports an untracked artist without a fabricated zero', () => {
  const snapshot = Roster.from(ROSTER_SEED).toJSON()
  const ellumf = snapshot.artists.find((artist) => artist.name === 'Ellumf')

  assert.equal(ellumf.tracked, false)
  assert.deepEqual(ellumf.metrics, [])
  assert.equal(ellumf.spotifyUrl, null)
})

test('toJSON reflects a sourced metric as tracked with provenance', () => {
  const roster = Roster.from([
    {
      name: 'Big Homie Cash',
      role: 'owner',
      spotifyUrl: 'https://open.spotify.com/artist/40z5aBKSs2Wtdori0baO1l',
      metrics: [{ source: 'spotify', metricType: 'monthly_listeners', value: 15, asOf: '2026-02-01T00:00:00.000Z' }]
    }
  ])

  const snapshot = roster.toJSON()

  assert.equal(snapshot.aggregate.complete, true)
  assert.equal(snapshot.aggregate.total, 15)
  assert.equal(snapshot.artists[0].tracked, true)
})

test('hasMetric is false for an unknown artist and for a mismatched source', () => {
  const roster = Roster.from(ROSTER_SEED)

  assert.equal(roster.hasMetric('Nobody'), false)
  assert.equal(roster.hasMetric('Big Homie Cash', { source: 'apple' }), false)
})
