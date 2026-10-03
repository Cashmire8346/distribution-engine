// DMF Workshop - a scratchpad of work-in-progress ideas, one JSON file per item.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const WORKSHOP_STATUSES = Object.freeze(['idea', 'in-progress', 'done'])

export class WorkshopError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'WorkshopError'
    Object.assign(this, details)
  }
}

export function createWorkshopItem(input = {}) {
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new WorkshopError('title is required', { field: 'title' })
  }
  if (input.status !== undefined && !WORKSHOP_STATUSES.includes(input.status)) {
    throw new WorkshopError(`status must be one of ${WORKSHOP_STATUSES.join(', ')}`, { field: 'status' })
  }
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
    status: input.status ?? 'idea',
    createdAt: now,
    updatedAt: now
  }
}

export class WorkshopStore {
  #dir
  #items = new Map()

  constructor(dir) {
    this.#dir = dir
    fs.mkdirSync(dir, { recursive: true })
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'))
        if (parsed && typeof parsed.id === 'string') this.#items.set(parsed.id, parsed)
      } catch {
        // A corrupt file is skipped rather than crashing boot.
      }
    }
  }

  create(input) {
    const item = createWorkshopItem(input)
    fs.writeFileSync(path.join(this.#dir, `${item.id}.json`), JSON.stringify(item, null, 2))
    this.#items.set(item.id, item)
    return item
  }

  list() {
    return [...this.#items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
