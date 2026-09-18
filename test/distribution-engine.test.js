import test from 'node:test'
import assert from 'node:assert/strict'
import { validateIsrc, validateUpc, validateIsni, validateGrid, validateOwnershipSplit, validateReleaseIdentifiers } from '../src/identifiers/index.js'
import { generateErn, validateErnXml } from '../src/ern/index.js'
import { ApprovalGate, FileApprovalStore, InMemoryIdentifierStore, deliverErn } from '../src/index.js'

test('validates identifiers and rejects malformed values', () => {
  assert.equal(validateIsrc('USDMF2600001'), true)
  assert.equal(validateIsrc('bad-isrc'), false)
  assert.equal(validateUpc('123456789012'), true)
  assert.equal(validateUpc('123456789013'), false)
  assert.equal(validateIsni('000000012281955X'), true)
  assert.equal(validateGrid('A1B2C3D4'), true)
})

test('requires ownership totals to equal 100 percent', () => {
  assert.equal(validateOwnershipSplit([{ name: 'DMF Records', share: 100 }]), true)
  assert.equal(validateOwnershipSplit([{ name: 'DMF Records', share: 60 }, { name: 'Artist', share: 30 }]), false)
})

test('accepts a release only when its identifiers and ownership are valid', () => {
  assert.equal(validateReleaseIdentifiers({ isrc: 'USDMF2600001', upc: '123456789012', owners: [{ name: 'DMF Records', share: 100 }] }), true)
  assert.equal(validateReleaseIdentifiers({ isrc: 'USDMF2600001', upc: '123456789013', owners: [{ name: 'DMF Records', share: 100 }] }), false)
})

test('rejects malformed release payloads without throwing', () => {
  assert.equal(validateReleaseIdentifiers(null), false)
  assert.equal(validateReleaseIdentifiers({}), false)
  assert.equal(validateReleaseIdentifiers({ isrc: 'USDMF2600001', upc: '123456789012', owners: [{ name: 'DMF Records', share: 100 }, null] }), false)
})

test('generates and structurally validates an ERN XML package', () => {
  const xml = generateErn({
    messageId: 'DMF-20260916-001',
    senderPartyId: 'DMF-PENDING-DSP-ID',
    senderName: 'DMF Records',
    title: 'Midnight Echo',
    artist: 'DMF Artist',
    isrc: 'USDMF2600001',
    upc: '123456789012',
    duration: 'PT2M45S',
    owners: [{ name: 'DMF Records', share: 100 }]
  })

  assert.equal(validateErnXml(xml), true)
  assert.match(xml, /<ISRC>USDMF2600001<\/ISRC>/)
  assert.match(xml, /<ICPN>123456789012<\/ICPN>/)
})

test('fails closed when no approval export is present', () => {
  const store = new FileApprovalStore('does-not-exist.json')
  const gate = new ApprovalGate(store)
  const result = gate.canDeliver({ releaseId: 'REL-001' })

  assert.equal(result.approved, false)
  assert.match(result.reason, /missing approval/i)
})

test('denies pending or rejected approval records', () => {
  const store = new FileApprovalStore('tmp-approval-deny.json')
  store.write({ approvals: [{ releaseId: 'REL-001', status: 'pending', approvedBy: 'ops' }] })

  const gate = new ApprovalGate(store)
  const pending = gate.canDeliver({ releaseId: 'REL-001' })
  assert.equal(pending.approved, false)

  store.write({ approvals: [{ releaseId: 'REL-001', status: 'rejected', approvedBy: 'ops' }] })
  const rejected = gate.canDeliver({ releaseId: 'REL-001' })
  assert.equal(rejected.approved, false)
})

test('allows delivery when a matching approved record exists', () => {
  const store = new FileApprovalStore('tmp-approval-allow.json')
  store.write({ approvals: [{ releaseId: 'REL-APPROVED', status: 'approved', approvedBy: 'ops', approvedAt: '2026-09-18T00:00:00.000Z' }] })

  const gate = new ApprovalGate(store)
  const result = gate.canDeliver({ releaseId: 'REL-APPROVED' })

  assert.equal(result.approved, true)
  assert.equal(result.approval.releaseId, 'REL-APPROVED')
})

test('deliverErn denies missing approval exports without crashing', () => {
  const result = deliverErn({
    messageId: 'DMF-20260916-002',
    senderPartyId: 'DMF-PENDING-DSP-ID',
    senderName: 'DMF Records',
    title: 'Midnight Echo',
    artist: 'DMF Artist',
    isrc: 'USDMF2600001',
    upc: '123456789012',
    duration: 'PT2M45S',
    owners: [{ name: 'DMF Records', share: 100 }],
    releaseId: 'REL-MISSING'
  }, { approvalFile: 'does-not-exist.json' })

  assert.equal(result.approved, false)
  assert.match(result.reason, /missing approval/i)
})

test('deliverErn writes output when an approved record matches', () => {
  const file = 'tmp-approval-deliver-allow.json'
  const output = 'tmp-ern-output.xml'
  const store = new FileApprovalStore(file)
  store.write({ approvals: [{ releaseId: 'REL-WRITE', status: 'approved', approvedBy: 'ops', approvedAt: '2026-09-18T00:00:00.000Z' }] })

  const result = deliverErn({
    messageId: 'DMF-20260916-003',
    senderPartyId: 'DMF-PENDING-DSP-ID',
    senderName: 'DMF Records',
    title: 'Night Signal',
    artist: 'DMF Artist',
    isrc: 'USDMF2600001',
    upc: '123456789012',
    duration: 'PT3M20S',
    owners: [{ name: 'DMF Records', share: 100 }],
    releaseId: 'REL-WRITE'
  }, { approvalFile: file, outputPath: output })

  assert.equal(result.approved, true)
  assert.match(result.outputPath, /tmp-ern-output.xml/)
  assert.ok(result.xml.includes('<MessageId>DMF-20260916-003'))
})

test('registry rejects duplicate UPCs', () => {
  const registry = new InMemoryIdentifierStore()
  const release = {
    messageId: 'DMF-20260916-004',
    senderPartyId: 'DMF-PENDING-DSP-ID',
    senderName: 'DMF Records',
    title: 'Duplicate Gate',
    artist: 'DMF Artist',
    isrc: 'USDMF2600002',
    upc: '123456789012',
    duration: 'PT2M10S',
    owners: [{ name: 'DMF Records', share: 100 }]
  }

  registry.create(release)
  assert.throws(() => registry.create(release), /already registered/)
})

test('registry rejects duplicate ISRCs', () => {
  const registry = new InMemoryIdentifierStore()
  const releaseA = {
    messageId: 'DMF-20260916-005',
    senderPartyId: 'DMF-PENDING-DSP-ID',
    senderName: 'DMF Records',
    title: 'Alpha Signal',
    artist: 'DMF Artist',
    isrc: 'USDMF2600003',
    upc: '123456789012',
    duration: 'PT2M11S',
    owners: [{ name: 'DMF Records', share: 100 }]
  }
  const releaseB = {
    ...releaseA,
    messageId: 'DMF-20260916-006',
    upc: '987654321012'
  }

  registry.create(releaseA)
  assert.throws(() => registry.create(releaseB), /already registered/)
})

test('registry rejects invalid identifiers before storing', () => {
  const registry = new InMemoryIdentifierStore()
  assert.throws(() => registry.create({
    isrc: 'bad',
    upc: 'bad',
    owners: [{ name: 'Cash', share: 100 }]
  }))
})
