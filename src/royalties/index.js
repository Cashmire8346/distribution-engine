// Royalty ledger.
//
// Each entry is one statement line from a real source (a DSP, distributor,
// PRO or sync licence): gross income for an artist and period, plus the
// artist's contractual share in basis points. The payout is COMPUTED from
// those two entered numbers. Nothing here estimates or projects income.

import crypto from 'node:crypto'

import { readJsonFile, writeJsonFile } from '../jsonstore.js'

export const ROYALTY_SOURCES = Object.freeze([
  'spotify', 'apple', 'youtube', 'amazon', 'tidal', 'symphonic', 'pro', 'sync', 'publisher', 'other'
])

export class RoyaltyError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'RoyaltyError'
    Object.assign(this, details)
  }
}

export function splitGross(grossCents, artistShareBps) {
  const artistCents = Math.round((grossCents * artistShareBps) / 10000)
  return { artistCents, labelCents: grossCents - artistCents }
}

export class RoyaltyStore {
  #file

  constructor(file) {
    this.#file = file
  }

  #read() {
    const data = readJsonFile(this.#file, { entries: [] })
    if (!data || !Array.isArray(data.entries)) {
      throw new RoyaltyError(`royalty file must contain an "entries" array: ${this.#file}`)
    }
    return data
  }

  list() {
    return this.#read().entries.map((e) => ({ ...e, ...splitGross(e.grossCents, e.artistShareBps) }))
  }

  add(input = {}, now = new Date()) {
    const artist = typeof input.artist === 'string' ? input.artist.trim() : ''
    if (artist === '') throw new RoyaltyError('artist is required', { field: 'artist' })
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period ?? '')) {
      throw new RoyaltyError('period must be YYYY-MM', { field: 'period' })
    }
    if (!ROYALTY_SOURCES.includes(input.source)) {
      throw new RoyaltyError(`source must be one of ${ROYALTY_SOURCES.join(', ')}`, { field: 'source' })
    }
    if (!Number.isInteger(input.grossCents) || input.grossCents < 0) {
      throw new RoyaltyError('grossCents must be a non-negative integer number of cents', { field: 'grossCents' })
    }
    if (!Number.isInteger(input.artistShareBps) || input.artistShareBps < 0 || input.artistShareBps > 10000) {
      throw new RoyaltyError('artistShareBps must be an integer from 0 to 10000', { field: 'artistShareBps' })
    }

    const entry = {
      id: crypto.randomUUID(),
      artist,
      period: input.period,
      source: input.source,
      grossCents: input.grossCents,
      artistShareBps: input.artistShareBps,
      statementRef: typeof input.statementRef === 'string' && input.statementRef.trim() ? input.statementRef.trim() : null,
      paidAt: null,
      createdAt: now.toISOString()
    }

    const data = this.#read()
    data.entries.push(entry)
    writeJsonFile(this.#file, data)
    return { ...entry, ...splitGross(entry.grossCents, entry.artistShareBps) }
  }

  markPaid(id, now = new Date()) {
    const data = this.#read()
    const entry = data.entries.find((e) => e.id === id)
    if (!entry) throw new RoyaltyError('No such royalty entry', { field: 'id', code: 404 })
    if (entry.paidAt) throw new RoyaltyError('Entry is already marked paid', { field: 'paidAt', code: 409 })
    entry.paidAt = now.toISOString()
    writeJsonFile(this.#file, data)
    return { ...entry, ...splitGross(entry.grossCents, entry.artistShareBps) }
  }

  // Totals in cents. owedToArtistsCents is the unpaid artist share.
  summary() {
    const entries = this.list()
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
    const unpaid = entries.filter((e) => !e.paidAt)
    return {
      entries: entries.length,
      grossCents: sum(entries, 'grossCents'),
      artistCents: sum(entries, 'artistCents'),
      labelCents: sum(entries, 'labelCents'),
      owedToArtistsCents: sum(unpaid, 'artistCents'),
      bySource: Object.entries(
        entries.reduce((acc, e) => ({ ...acc, [e.source]: (acc[e.source] ?? 0) + e.grossCents }), {})
      ).map(([source, grossCents]) => ({ source, grossCents }))
    }
  }
}
