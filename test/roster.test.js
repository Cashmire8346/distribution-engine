import test from 'node:test'
import assert from 'node:assert/strict'

import {
  Roster,
  RosterError,
  ROSTER_SEED,
  parseSpotifyArtistUrl,
  validateMetric
} from '../src/index.js'

test('spotify artist URLs are parsed, and non-URLs are rejected', () => {
  assert.equal(
    parseSpotifyArtistUrl('https://open.spotify.com/artist/40z5aBKSs2Wtdori0baO1l'),
    '40z5aBKSs2Wtdori0baO1l'
  )
  assert.equal(parseSpotifyArtistUrl('https://open.spotify.com/search/Freezzo'), null)
  assert.equal(parseSpotifyArtistUrl('Search "Freezzo" on Spotify'), null)
  assert.equal(parseSpotifyArtistUrl('https://open.spotify.com/artist/too-short'), null)
  assert.equal(parseSpotifyArtistUrl(undefined), null)
})

test('the seed roster loads and preserves role, location and bio', () => {
  const roster = Roster.from(ROSTER_SEED)

  assert.equal(roster.list().length, 5)
  assert.equal(roster.get('Big Homie Cash').role, 'owner')
  assert.equal(roster.get('Freezzo').role, 'core')
  assert.match(roster.get('OBMB DELO').location, /Columbus/)
  assert.match(roster.get('Big Homie Cash').bio, /Fly Hoolie/i)
})

test('an artist with no Spotify profile is recorded as unlinked, not guessed', () => {
  const roster = Roster.from(ROSTER_SEED)

  assert.deepEqual(roster.unlinked(), ['Ellumf'])
  assert.equal(roster.get('Ellumf').spotifyId, null)
  assert.equal(roster.get('Ellumf').spotifyUrl, null)
})

test('a search phrase passed as a Spotify URL is a hard error, not an empty link', () => {
  assert.throws(
    () => Roster.from([{ name: 'Ellumf', role: 'core', spotifyUrl: 'Search Ellumf on Spotify' }]),
    RosterError
  )
  assert.throws(
    () => Roster.from([{ name: 'Ellumf', role: 'core', spotifyUrl: 'https://open.spotify.com/search/Ellumf' }]),
    RosterError
  )
})

test('an unknown role is rejected rather than silently defaulting', () => {
  assert.throws(
    () => Roster.from([{ name: 'Mystery', role: 'intern' }]),
    /role must be one of/
  )
})

test('duplicate artists cannot be registered twice', () => {
  const roster = Roster.from([{ name: 'Freezzo', role: 'core' }])

  assert.throws(() => roster.add({ name: 'Freezzo', role: 'core' }), /duplicate artist/)
})

test('a metric without a source or timestamp is rejected', () => {
  assert.throws(() => validateMetric({ metricType: 'monthly_listeners', value: 15 }), /metric\.source/)
  assert.throws(
    () => validateMetric({ source: 'spotify', metricType: 'monthly_listeners', value: 15 }),
    /asOf/
  )
  assert.throws(
    () => validateMetric({ source: 'spotify', metricType: 'monthly_listeners', value: -1, asOf: '2026-02-01T00:00:00.000Z' }),
    /non-negative integer/
  )
  assert.throws(
    () => validateMetric({ source: 'myspace', metricType: 'plays', value: 1, asOf: '2026-02-01T00:00:00.000Z' }),
    /metric\.source/
  )
})

test('an attributed metric is carried through with its provenance intact', () => {
  const roster = Roster.from([
    {
      name: 'Big Homie Cash',
      role: 'owner',
      spotifyUrl: 'https://open.spotify.com/artist/40z5aBKSs2Wtdori0baO1l',
      metrics: [{ source: 'spotify', metricType: 'monthly_listeners', value: 15, asOf: '2026-02-01T00:00:00.000Z' }]
    }
  ])

  const [metric] = roster.get('Big Homie Cash').metrics
  assert.equal(metric.value, 15)
  assert.equal(metric.source, 'spotify')
  assert.equal(metric.asOf, '2026-02-01T00:00:00.000Z')
})

test('the seed roster exposes no unsourced listener numbers', () => {
  const roster = Roster.from(ROSTER_SEED)
  const totalMetrics = roster.list().reduce((sum, artist) => sum + artist.metrics.length, 0)

  assert.equal(totalMetrics, 0)
})

test('a partial roster aggregate reports incomplete instead of a misleading total', () => {
  const roster = Roster.from([
    {
      name: 'Big Homie Cash',
      role: 'owner',
      metrics: [{ source: 'spotify', metricType: 'monthly_listeners', value: 15, asOf: '2026-02-01T00:00:00.000Z' }]
    },
    { name: 'Ellumf', role: 'core' }
  ])

  const aggregate = roster.aggregate({ metricType: 'monthly_listeners', source: 'spotify' })

  assert.equal(aggregate.complete, false)
  assert.equal(aggregate.total, null)
  assert.deepEqual(aggregate.missing, ['Ellumf'])
})

test('a complete aggregate sums values and reports its oldest reading', () => {
  const roster = Roster.from([
    {
      name: 'Big Homie Cash',
      role: 'owner',
      metrics: [{ source: 'spotify', metricType: 'monthly_listeners', value: 15, asOf: '2026-02-01T00:00:00.000Z' }]
    },
    {
      name: 'Freezzo',
      role: 'core',
      metrics: [{ source: 'spotify', metricType: 'monthly_listeners', value: 13, asOf: '2026-01-15T00:00:00.000Z' }]
    }
  ])

  const aggregate = roster.aggregate({ metricType: 'monthly_listeners', source: 'spotify' })

  assert.equal(aggregate.complete, true)
  assert.equal(aggregate.total, 28)
  assert.equal(aggregate.asOf, '2026-01-15T00:00:00.000Z')
})
