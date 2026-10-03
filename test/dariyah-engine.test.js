import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DIVISIONS,
  DIVISION_STATUS,
  DariyahError,
  listDivisions,
  getDivision,
  engineStatus
} from '../src/index.js'

test('all three divisions are declared with an exposure and a status', () => {
  const divisions = listDivisions()

  assert.deepEqual(divisions.map((d) => d.id).sort(), ['build', 'code', 'create'])
  assert.equal(divisions.every((d) => Object.values(DIVISION_STATUS).includes(d.status)), true)
  assert.equal(divisions.every((d) => ['public', 'internal'].includes(d.exposure)), true)
})

test('the creative division is public, and build and code are internal', () => {
  assert.equal(getDivision('create').exposure, 'public')
  assert.equal(getDivision('build').exposure, 'internal')
  assert.equal(getDivision('code').exposure, 'internal')
})

test('the creative division reports what is built and what is blocked', () => {
  const division = getDivision('create')

  assert.equal(division.status, DIVISION_STATUS.PARTIAL)
  assert.ok(division.capabilities.length > 0)
  assert.ok(division.capabilities.some((c) => c.path.includes('video/index.js')))
  assert.ok(division.blockedBy.some((b) => /no video model/.test(b)))
})

test('the app builder and engineering divisions have contracts but no model', () => {
  assert.equal(getDivision('build').status, DIVISION_STATUS.PARTIAL)
  assert.equal(getDivision('code').status, DIVISION_STATUS.PARTIAL)
  assert.ok(getDivision('build').capabilities.length > 0)
  assert.ok(getDivision('code').capabilities.length > 0)
})

test('a partial division lists what blocks it from being complete', () => {
  assert.ok(getDivision('build').blockedBy.some((b) => /no code-generation model/.test(b)))
  assert.ok(getDivision('build').blockedBy.some((b) => /no sandbox execution backend/.test(b)))
  assert.ok(getDivision('code').blockedBy.some((b) => /applying a migration is not implemented/.test(b)))
})

test('an unknown division is an error, not an empty result', () => {
  assert.throws(() => getDivision('marketing'), DariyahError)
  assert.throws(() => getDivision('marketing'), /No division named/)
})

test('engine status counts divisions and denies every generation capability', () => {
  const status = engineStatus()

  assert.equal(status.engine, "Da'Riyah")
  assert.equal(status.divisions, 3)
  assert.equal(status.available, 0)
  assert.equal(status.partial, 3)
  assert.equal(status.unavailable, 0)
  assert.equal(status.canGenerateVideo, false)
  assert.equal(status.canGenerateApps, false)
  assert.equal(status.canGenerateCode, false)
})

test('returned divisions are copies and cannot mutate the registry', () => {
  const division = getDivision('create')
  division.blockedBy.push('injected')
  division.capabilities.length = 0

  assert.ok(!DIVISIONS.create.blockedBy.includes('injected'))
  assert.ok(DIVISIONS.create.capabilities.length > 0)
})
