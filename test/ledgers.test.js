import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  ApprovalGate,
  ReleaseStore,
  ReleaseError,
  CampaignStore,
  CampaignError,
  RoyaltyStore,
  RoyaltyError,
  Roster,
  ROSTER_SEED,
  roiFor,
  splitGross
} from '../src/index.js'

const tmp = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), name)

// ---- releases + approval gate ------------------------------------------

test('a new release is pending and the delivery gate denies it', () => {
  const file = tmp('approvals.json')
  const store = new ReleaseStore(file)
  const rec = store.create({ title: 'Midnight Echo', artist: 'Freezzo', format: 'single' }, { requestedBy: 'owner' })
  assert.equal(rec.status, 'pending')
  assert.equal(new ApprovalGate(file).canDeliver({ releaseId: rec.releaseId }).approved, false)
})

test('approving through the store makes the SAME file pass the gate; rejecting does not', () => {
  const file = tmp('approvals.json')
  const store = new ReleaseStore(file)
  const a = store.create({ title: 'A', artist: 'Freezzo', format: 'ep' })
  const b = store.create({ title: 'B', artist: 'Freezzo', format: 'album' })

  store.decide(a.releaseId, { decision: 'approved', by: 'owner@dmf.test' })
  store.decide(b.releaseId, { decision: 'rejected', by: 'owner@dmf.test' })

  const gate = new ApprovalGate(file)
  assert.equal(gate.canDeliver({ releaseId: a.releaseId }).approved, true)
  assert.equal(gate.canDeliver({ releaseId: b.releaseId }).approved, false)
})

test('approval expires per ttl and the gate then denies', () => {
  const file = tmp('approvals.json')
  const store = new ReleaseStore(file)
  const r = store.create({ title: 'A', artist: 'X', format: 'single' })
  store.decide(r.releaseId, { decision: 'approved', by: 'o', ttlDays: 1, now: new Date(Date.now() - 2 * 86400000) })
  assert.match(new ApprovalGate(file).canDeliver({ releaseId: r.releaseId }).reason, /expired/i)
})

test('a decision records who, cannot be repeated, and bad input is refused', () => {
  const store = new ReleaseStore(tmp('approvals.json'))
  const r = store.create({ title: 'A', artist: 'X', format: 'single' })
  assert.throws(() => store.decide(r.releaseId, { decision: 'approved' }), /who made it/)
  assert.throws(() => store.decide(r.releaseId, { decision: 'maybe', by: 'o' }), /decision must be/)
  assert.throws(() => store.decide('nope', { decision: 'approved', by: 'o' }), (e) => e.code === 404)
  const done = store.decide(r.releaseId, { decision: 'approved', by: 'o' })
  assert.equal(done.decidedBy, 'o')
  assert.throws(() => store.decide(r.releaseId, { decision: 'rejected', by: 'o' }), (e) => e.code === 409)
  assert.throws(() => store.create({ title: '', artist: 'X', format: 'single' }), ReleaseError)
  assert.throws(() => store.create({ title: 'A', artist: 'X', format: 'mixtape' }), /format must be/)
})

test('stores refuse to overwrite a corrupt file', () => {
  const file = tmp('approvals.json')
  fs.writeFileSync(file, '{ broken')
  const store = new ReleaseStore(file)
  assert.throws(() => store.create({ title: 'A', artist: 'X', format: 'single' }), /not valid JSON/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken', 'the corrupt file must be left untouched')
})

// ---- campaigns ----------------------------------------------------------

test('ROI is null until both spend and attributed revenue are entered, then computed', () => {
  const store = new CampaignStore(tmp('c.json'))
  const c = store.create({ name: 'Summer', spendCents: 10000 })
  assert.equal(c.roi, null)
  assert.equal(roiFor({ spendCents: 0, attributedRevenueCents: 500 }), null)
  const updated = store.update(c.id, { attributedRevenueCents: 25000 })
  assert.equal(updated.roi, 2.5)
  assert.equal(store.list()[0].roi, 2.5)
})

test('campaign validation: cents must be integers, names unique, status known', () => {
  const store = new CampaignStore(tmp('c.json'))
  assert.throws(() => store.create({ name: 'A', spendCents: 12.5 }), CampaignError)
  assert.throws(() => store.create({ name: 'A', spendCents: -1 }), CampaignError)
  assert.throws(() => store.create({ name: '' }), /name is required/)
  assert.throws(() => store.create({ name: 'A', status: 'viral' }), /status must be/)
  store.create({ name: 'A' })
  assert.throws(() => store.create({ name: 'A' }), (e) => e.code === 409)
  assert.throws(() => store.update('nope', {}), (e) => e.code === 404)
})

// ---- royalties ----------------------------------------------------------

test('payout is computed from entered gross and share, and splits sum exactly', () => {
  assert.deepEqual(splitGross(10001, 5000), { artistCents: 5001, labelCents: 5000 })
  const { artistCents, labelCents } = splitGross(12345, 3333)
  assert.equal(artistCents + labelCents, 12345)
})

test('royalty entries are validated and summarised; owed counts only unpaid', () => {
  const store = new RoyaltyStore(tmp('r.json'))
  const a = store.add({ artist: 'Freezzo', period: '2026-09', source: 'spotify', grossCents: 100000, artistShareBps: 5000 })
  store.add({ artist: 'Freezzo', period: '2026-09', source: 'apple', grossCents: 40000, artistShareBps: 5000 })

  assert.equal(a.artistCents, 50000)
  let summary = store.summary()
  assert.equal(summary.grossCents, 140000)
  assert.equal(summary.owedToArtistsCents, 70000)

  store.markPaid(a.id)
  summary = store.summary()
  assert.equal(summary.owedToArtistsCents, 20000)
  assert.throws(() => store.markPaid(a.id), (e) => e.code === 409)

  assert.throws(() => store.add({ artist: 'X', period: '2026-13', source: 'spotify', grossCents: 1, artistShareBps: 1 }), /YYYY-MM/)
  assert.throws(() => store.add({ artist: 'X', period: '2026-01', source: 'guess', grossCents: 1, artistShareBps: 1 }), RoyaltyError)
  assert.throws(() => store.add({ artist: 'X', period: '2026-01', source: 'apple', grossCents: 1.5, artistShareBps: 1 }), /integer/)
  assert.throws(() => store.add({ artist: 'X', period: '2026-01', source: 'apple', grossCents: 1, artistShareBps: 10001 }), /0 to 10000/)
  assert.deepEqual(new RoyaltyStore(tmp('empty.json')).summary().entries, 0)
})

// ---- analytics ----------------------------------------------------------

test('roster analytics: no groups without data; a total only when every artist reports', () => {
  const roster = Roster.from(ROSTER_SEED)
  assert.deepEqual(roster.analytics(), [])

  roster.addMetric('Freezzo', { source: 'youtube', metricType: 'subscribers', value: 5, asOf: '2026-10-01T00:00:00.000Z' })
  let [group] = roster.analytics()
  assert.equal(group.complete, false)
  assert.equal(group.total, null)
  assert.equal(group.artistsReporting, 1)
  assert.equal(group.artistsTotal, 5)

  for (const a of roster.list().filter((x) => x.name !== 'Freezzo')) {
    roster.addMetric(a.name, { source: 'youtube', metricType: 'subscribers', value: 1, asOf: '2026-10-01T00:00:00.000Z' })
  }
  ;[group] = roster.analytics()
  assert.equal(group.complete, true)
  assert.equal(group.total, 9)
})
