// Da'Riyah - audit log for generated artefacts.
//
// Any code a model proposes, and any schema change approved, is recorded here
// before it can be applied. Append-only by convention: entries are never
// updated or removed. This is the record that answers "what did the engine
// produce, who approved it, and when".

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const AUDIT_EVENTS = Object.freeze([
  'proposal.created',
  'proposal.approved',
  'proposal.rejected',
  'migration.approved',
  'migration.applied',
  'sandbox.run'
])

export class AuditError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'AuditError'
    Object.assign(this, details)
  }
}

export class AuditLog {
  #file

  constructor(filePath) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new AuditError('an audit log file path is required', { field: 'filePath' })
    }
    this.#file = filePath
    fs.mkdirSync(path.dirname(path.resolve(this.#file)), { recursive: true })
  }

  append(event, payload = {}) {
    if (!AUDIT_EVENTS.includes(event)) {
      throw new AuditError(`event must be one of ${AUDIT_EVENTS.join(', ')}`, { field: 'event' })
    }

    const entry = {
      id: crypto.randomUUID(),
      event,
      at: new Date().toISOString(),
      ...payload
    }

    // One JSON object per line: appendable without rewriting the file.
    fs.appendFileSync(this.#file, `${JSON.stringify(entry)}\n`)
    return entry
  }

  read({ event, limit } = {}) {
    if (!fs.existsSync(this.#file)) return []

    const lines = fs.readFileSync(this.#file, 'utf8').split('\n').filter((line) => line.trim() !== '')

    const entries = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // A corrupt line is skipped rather than discarding the whole log.
      }
    }

    const filtered = event ? entries.filter((entry) => entry.event === event) : entries
    return limit ? filtered.slice(-limit) : filtered
  }

  // Looks up everything recorded against one artefact id.
  trailFor(id) {
    return this.read().filter((entry) => Object.values(entry).includes(id))
  }
}
