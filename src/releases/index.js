// Release pipeline + approval records.
//
// The store file is the SAME format ApprovalGate reads ({ approvals: [...] }),
// so the dashboard and the delivery gate share one source of truth. A release
// exists here as a record; it is deliverable only if its record is approved
// and unexpired, which ApprovalGate enforces and this module never bypasses.

import crypto from 'node:crypto'

import { readJsonFile, writeJsonFile } from '../jsonstore.js'

export const RELEASE_FORMATS = Object.freeze(['single', 'ep', 'album'])
export const APPROVAL_DECISIONS = Object.freeze(['approved', 'rejected'])
export const DEFAULT_APPROVAL_TTL_DAYS = 30

export class ReleaseError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ReleaseError'
    Object.assign(this, details)
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export class ReleaseStore {
  #file

  constructor(file) {
    this.#file = file
  }

  #read() {
    const data = readJsonFile(this.#file, { approvals: [] })
    if (!data || !Array.isArray(data.approvals)) {
      throw new ReleaseError(`approvals file must contain an "approvals" array: ${this.#file}`)
    }
    return data
  }

  list() {
    return [...this.#read().approvals].sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
  }

  get(releaseId) {
    return this.#read().approvals.find((r) => String(r.releaseId) === String(releaseId)) ?? null
  }

  // Creates a PENDING record. Nothing is approved by being created.
  create(input = {}, { requestedBy = null, now = new Date() } = {}) {
    const title = text(input.title)
    const artist = text(input.artist)
    if (title === '') throw new ReleaseError('title is required', { field: 'title' })
    if (artist === '') throw new ReleaseError('artist is required', { field: 'artist' })
    if (!RELEASE_FORMATS.includes(input.format)) {
      throw new ReleaseError(`format must be one of ${RELEASE_FORMATS.join(', ')}`, { field: 'format' })
    }
    if (input.releaseDate != null && input.releaseDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(input.releaseDate)) {
      throw new ReleaseError('releaseDate must be YYYY-MM-DD', { field: 'releaseDate' })
    }

    const record = {
      releaseId: crypto.randomUUID(),
      title,
      artist,
      format: input.format,
      releaseDate: input.releaseDate || null,
      status: 'pending',
      requestedAt: now.toISOString(),
      requestedBy,
      decidedAt: null,
      decidedBy: null,
      expiresAt: null
    }

    const data = this.#read()
    data.approvals.push(record)
    writeJsonFile(this.#file, data)
    return record
  }

  // Records a human decision. Only a pending record can be decided; a decided
  // record is history and is not edited in place.
  decide(releaseId, { decision, by, ttlDays = DEFAULT_APPROVAL_TTL_DAYS, now = new Date() } = {}) {
    if (!APPROVAL_DECISIONS.includes(decision)) {
      throw new ReleaseError(`decision must be one of ${APPROVAL_DECISIONS.join(', ')}`, { field: 'decision' })
    }
    if (typeof by !== 'string' || by.trim() === '') {
      throw new ReleaseError('a decision must record who made it', { field: 'by' })
    }
    if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
      throw new ReleaseError('ttlDays must be an integer from 1 to 365', { field: 'ttlDays' })
    }

    const data = this.#read()
    const record = data.approvals.find((r) => String(r.releaseId) === String(releaseId))
    if (!record) throw new ReleaseError('No such release', { field: 'releaseId', code: 404 })
    if (record.status !== 'pending') {
      throw new ReleaseError(`Release is already ${record.status}; it cannot be decided again`, { field: 'status', code: 409 })
    }

    record.status = decision
    record.decidedAt = now.toISOString()
    record.decidedBy = by
    record.expiresAt =
      decision === 'approved' ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null

    writeJsonFile(this.#file, data)
    return record
  }
}
