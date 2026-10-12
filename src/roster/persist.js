// Persistence for the roster.
//
// ROSTER_SEED supplies artist identity. Metrics come from here: a JSON file of
// sourced, timestamped readings. Nothing in this module invents a number.
//
// Fail loud, not quiet: a corrupt roster file throws. Falling back to the seed
// would make the dashboard look healthy while quietly dropping every reading.

import fs from 'node:fs'
import path from 'node:path'

import { Roster, RosterError, ROSTER_SEED } from './index.js'

// Loads the roster. A missing file means "nothing recorded yet" and yields the
// seed with no metrics. A present-but-unreadable file is an error.
export function loadRoster(file, seed = ROSTER_SEED) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return Roster.from(seed)
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RosterError(`roster file is not valid JSON: ${file}`)
  }
  if (!parsed || !Array.isArray(parsed.artists)) {
    throw new RosterError(`roster file must contain an "artists" array: ${file}`)
  }
  return Roster.from(parsed.artists)
}

// Atomic write: temp file then rename, so a crash never leaves a half-written
// roster behind.
export function saveRoster(roster, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const payload = JSON.stringify({ artists: roster.list() }, null, 2)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, payload)
  fs.renameSync(tmp, file)
}

// Records one reading and persists it. Validation happens in Roster#addMetric
// before anything is written.
export function recordMetric(file, name, metric, seed = ROSTER_SEED) {
  const roster = loadRoster(file, seed)
  roster.addMetric(name, metric)
  saveRoster(roster, file)
  return roster
}

// Maps rows from the Supabase schema (supabase/migrations) to Roster input.
// artists: { name, role, location, vibe, bio, spotify_id }
// metrics: { artist_name, source, metric_type, value, as_of }
// Rows are validated by Roster itself; a malformed row throws.
export function rosterFromRows({ artists, metrics = [] }) {
  if (!Array.isArray(artists)) throw new RosterError('artists rows must be an array')

  const byName = new Map(
    artists.map((row) => [
      row.name,
      {
        name: row.name,
        role: row.role,
        location: row.location ?? null,
        vibe: row.vibe ?? null,
        bio: row.bio ?? null,
        spotifyUrl: row.spotify_id ? `https://open.spotify.com/artist/${row.spotify_id}` : null,
        metrics: []
      }
    ])
  )

  for (const row of metrics) {
    const artist = byName.get(row.artist_name)
    if (!artist) throw new RosterError('metric row references an unknown artist', { artist: row.artist_name })
    artist.metrics.push({
      source: row.source,
      metricType: row.metric_type,
      value: Number(row.value),
      asOf: new Date(row.as_of).toISOString()
    })
  }

  return Roster.from([...byName.values()])
}
