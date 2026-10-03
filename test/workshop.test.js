import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { WorkshopStore, WorkshopError } from '../src/workshop/index.js'

test('workshop items persist across store instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-'))
  const first = new WorkshopStore(dir)
  const item = first.create({ title: '  Hook idea ', notes: 'half-time drop' })

  assert.equal(item.title, 'Hook idea')
  assert.equal(item.status, 'idea')
  assert.deepEqual(new WorkshopStore(dir).list().map((i) => i.id), [item.id])
})

test('workshop rejects a missing title and an unknown status', () => {
  const store = new WorkshopStore(fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-')))
  assert.throws(() => store.create({}), WorkshopError)
  assert.throws(() => store.create({ title: 'x', status: 'nope' }), WorkshopError)
})
