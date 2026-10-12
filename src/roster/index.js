// Roster registry for DMF RECORDS FLY HOOLIE ENT.
//
// Design rule, consistent with the rest of this engine: fail closed.
// A metric is NEVER a bare number. It is either absent, or it carries a
// `source` and an `asOf` timestamp so the UI can always answer "where did
// this come from, and how old is it?". There is no code path here that
// invents a listener count.

const ROLES = new Set(['owner', 'core', 'affiliate'])

// A Spotify artist id is 22 chars of base62. Anything else is not an id.
const SPOTIFY_ID_PATTERN = /^[0-9A-Za-z]{22}$/

const METRIC_SOURCES = new Set(['spotify', 'apple', 'youtube', 'amazon', 'tidal', 'chartmetric', 'manual'])

export const ROSTER_ROLES = Object.freeze([...ROLES])
export const ROSTER_METRIC_SOURCES = Object.freeze([...METRIC_SOURCES])

export class RosterError extends Error {
  constructor(message, { artist, field } = {}) {
    super(artist ? `${artist}${field ? `.${field}` : ''}: ${message}` : message)
    this.name = 'RosterError'
    this.artist = artist
    this.field = field
  }
}

export function parseSpotifyArtistUrl(url) {
  if (typeof url !== 'string') return null
  const match = url.trim().match(/^https?:\/\/open\.spotify\.com\/artist\/([0-9A-Za-z]{22})(?:[?#].*)?$/)
  return match ? match[1] : null
}

// A metric is valid only if it is fully attributed. Value alone is rejected:
// an unattributed number is exactly the thing that goes stale silently.
export function validateMetric(metric, context = {}) {
  if (!metric || typeof metric !== 'object') {
    throw new RosterError('metric must be an object', { ...context, field: 'metrics' })
  }
  if (!METRIC_SOURCES.has(metric.source)) {
    throw new RosterError(`metric.source must be one of ${[...METRIC_SOURCES].join(', ')}`, {
      ...context,
      field: 'metrics.source'
    })
  }
  if (!Number.isInteger(metric.value) || metric.value < 0) {
    throw new RosterError('metric.value must be a non-negative integer', { ...context, field: 'metrics.value' })
  }
  if (typeof metric.metricType !== 'string' || metric.metricType.trim() === '') {
    throw new RosterError('metric.metricType is required', { ...context, field: 'metrics.metricType' })
  }
  if (typeof metric.asOf !== 'string' || Number.isNaN(Date.parse(metric.asOf))) {
    throw new RosterError('metric.asOf must be an ISO timestamp', { ...context, field: 'metrics.asOf' })
  }
  return true
}

// With a history of readings, the current value is the most recent by asOf.
// Picking the first match would silently report the oldest.
function latestReading(artist, metricType, source) {
  const matches = artist.metrics.filter((m) => m.metricType === metricType && m.source === source)
  if (matches.length === 0) return null
  return matches.reduce((latest, m) => (Date.parse(m.asOf) > Date.parse(latest.asOf) ? m : latest))
}

function normaliseArtist(input) {
  if (!input || typeof input !== 'object') {
    throw new RosterError('artist must be an object')
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name === '') throw new RosterError('name is required')

  if (!ROLES.has(input.role)) {
    throw new RosterError(`role must be one of ${ROSTER_ROLES.join(', ')}`, { artist: name, field: 'role' })
  }

  // Presence of a Spotify URL is optional, but a present one must be real.
  // "Search for them on Spotify" is not a link, and must not become one.
  let spotifyId = null
  if (input.spotifyUrl != null && String(input.spotifyUrl).trim() !== '') {
    spotifyId = parseSpotifyArtistUrl(input.spotifyUrl)
    if (spotifyId === null) {
      throw new RosterError('spotifyUrl is not a valid Spotify artist URL', {
        artist: name,
        field: 'spotifyUrl'
      })
    }
  }

  const metrics = Array.isArray(input.metrics) ? input.metrics : []
  for (const metric of metrics) validateMetric(metric, { artist: name })

  return Object.freeze({
    name,
    role: input.role,
    location: typeof input.location === 'string' ? input.location : null,
    vibe: typeof input.vibe === 'string' ? input.vibe : null,
    bio: typeof input.bio === 'string' ? input.bio : null,
    spotifyId,
    spotifyUrl: spotifyId ? `https://open.spotify.com/artist/${spotifyId}` : null,
    metrics: Object.freeze(metrics.map((m) => Object.freeze({ ...m })))
  })
}

export class Roster {
  #artists = new Map()

  static from(data) {
    if (!Array.isArray(data)) throw new RosterError('roster data must be an array of artists')
    const roster = new Roster()
    for (const entry of data) roster.add(entry)
    return roster
  }

  add(artist) {
    const normalised = normaliseArtist(artist)
    if (this.#artists.has(normalised.name)) {
      throw new RosterError(`duplicate artist`, { artist: normalised.name })
    }
    this.#artists.set(normalised.name, normalised)
    return normalised
  }

  // Records one sourced reading. Readings are history: a new asOf is appended,
  // never overwritten, and an identical (source, metricType, asOf) is refused.
  addMetric(name, metric) {
    const artist = this.#artists.get(name)
    if (!artist) throw new RosterError('unknown artist', { artist: name })
    validateMetric(metric, { artist: name })

    const duplicate = artist.metrics.some(
      (m) => m.source === metric.source && m.metricType === metric.metricType && m.asOf === metric.asOf
    )
    if (duplicate) throw new RosterError('duplicate reading for this source, metricType and asOf', { artist: name, field: 'metrics' })

    const updated = Object.freeze({
      ...artist,
      metrics: Object.freeze([...artist.metrics, Object.freeze({ ...metric })])
    })
    this.#artists.set(name, updated)
    return updated
  }

  get(name) {
    return this.#artists.get(name) ?? null
  }

  list() {
    return [...this.#artists.values()]
  }

  // Whether an artist has any metric from the requested source. The UI uses
  // this to decide between a real reading and an explicit "not tracked".
  hasMetric(name, { metricType = 'monthly_listeners', source = 'spotify' } = {}) {
    const artist = this.get(name)
    if (!artist) return false
    return artist.metrics.some((m) => m.metricType === metricType && m.source === source)
  }

  // Serialisable snapshot for the app layer. Deliberately carries the
  // aggregate's completeness so the UI cannot render a total that the data
  // does not support.
  toJSON({ metricType = 'monthly_listeners', source = 'spotify' } = {}) {
    return {
      header: 'DMF RECORDS FLY HOOLIE ENT Roster - Columbus Built, Worldwide Hustle',
      artists: this.list().map((artist) => ({
        ...artist,
        tracked: this.hasMetric(artist.name, { metricType, source })
      })),
      unlinked: this.unlinked(),
      aggregate: this.aggregate({ metricType, source })
    }
  }

  // Latest sourced reading per (artist, source, metricType), grouped by
  // source and metricType. A group's total is null unless every artist on the
  // roster reports it: a partial sum would look authoritative and not be.
  analytics() {
    const artists = this.list()
    const groups = new Map()
    for (const artist of artists) {
      for (const metric of artist.metrics) {
        const key = `${metric.source}\u0000${metric.metricType}`
        if (!groups.has(key)) groups.set(key, { source: metric.source, metricType: metric.metricType })
      }
    }

    return [...groups.values()].map(({ source, metricType }) => {
      const readings = artists
        .map((artist) => ({ artist: artist.name, reading: latestReading(artist, metricType, source) }))
        .filter((r) => r.reading !== null)
        .map((r) => ({ artist: r.artist, value: r.reading.value, asOf: r.reading.asOf }))
      const complete = readings.length === artists.length
      return {
        source,
        metricType,
        artistsReporting: readings.length,
        artistsTotal: artists.length,
        complete,
        total: complete ? readings.reduce((sum, r) => sum + r.value, 0) : null,
        readings
      }
    })
  }

  // Artists whose Spotify profile is not yet linked. These are the ones that
  // cannot be linked out to and must not be shown with metrics.
  unlinked() {
    return this.list().filter((artist) => artist.spotifyId === null).map((artist) => artist.name)
  }

  // Aggregate is deliberately strict: it refuses to produce a roster-wide
  // total unless every artist reports the same metric from the same source.
  // Summing a 15 from one artist and nothing from four others produces a
  // number that looks authoritative and is not.
  aggregate({ metricType, source }) {
    const contributors = this.list().filter((artist) =>
      artist.metrics.some((metric) => metric.metricType === metricType && metric.source === source)
    )

    const missing = this.list().filter((artist) => !contributors.includes(artist)).map((artist) => artist.name)

    if (missing.length > 0) {
      return {
        complete: false,
        reason: `No ${source} ${metricType} reading for: ${missing.join(', ')}`,
        missing,
        total: null
      }
    }

    const latest = contributors.map((artist) => latestReading(artist, metricType, source))
    const asOfValues = latest.map((m) => m.asOf)

    return {
      complete: true,
      total: latest.reduce((sum, m) => sum + m.value, 0),
      contributors: contributors.map((artist) => artist.name),
      // The oldest of the latest readings bounds the freshness of the total.
      asOf: asOfValues.sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    }
  }
}

// The roster as supplied. Metrics are intentionally EMPTY: the listener
// counts quoted in the brief have not been sourced or timestamped, and this
// module will not carry a number it cannot attribute. Fill them from a
// source you own, with an asOf stamp, via Roster#addMetric (persisted by src/roster/persist.js).
export const ROSTER_SEED = Object.freeze([
  {
    name: 'Big Homie Cash',
    role: 'owner',
    location: 'Columbus, Ohio (West Side)',
    vibe: 'Hip Hop/Rap - street hustle, motivational rise-up anthems, loyalty, trap-influenced.',
    bio: 'Artist out of Columbus Ohio who also owns DMF RECORDS FLY HOOLIE ENT. Building from the West Side.',
    spotifyUrl: 'https://open.spotify.com/artist/40z5aBKSs2Wtdori0baO1l',
    metrics: []
  },
  {
    name: 'Freezzo',
    role: 'core',
    location: 'Columbus, Ohio (West Side)',
    vibe: 'Hip Hop/Rap - hard-hitting raw bars, trap energy, some R&B/soul edges.',
    bio: 'Hot artist out of the west side of Columbus Ohio - locked in with DMF.',
    spotifyUrl: 'https://open.spotify.com/artist/4ksrusI7XnIdyuN6a3LtMj',
    metrics: []
  },
  {
    name: 'OBMB DELO',
    role: 'core',
    location: 'Columbus, Ohio area',
    vibe: 'Hip Hop/Rap, Alternative Rap - introspective storytelling, unique flows.',
    bio: 'Bringing that alternative edge to Columbus rap - deep cuts and real talk.',
    spotifyUrl: 'https://open.spotify.com/artist/6yjdymBNWSyr39uuuweOfT',
    metrics: []
  },
  {
    name: 'Go Savage',
    role: 'core',
    location: 'Columbus, Ohio',
    vibe: 'Hip Hop/Rap - gritty, aggressive trap and street anthems.',
    bio: 'Upcoming artist out of Columbus Ohio with something to prove.',
    spotifyUrl: 'https://open.spotify.com/artist/5qGClg4MZsh2r5ZD88rtEZ',
    metrics: []
  },
  {
    name: 'Ellumf',
    role: 'core',
    location: 'Columbus, Ohio area',
    vibe: 'Hip Hop/Rap with experimental twists.',
    bio: 'Versatile sound from Columbus - straight bars to unique fusions.',
    // No verified Spotify profile was supplied for Ellumf. Left null on
    // purpose: the registry rejects a guessed or search-page URL.
    spotifyUrl: null,
    metrics: []
  }
])
