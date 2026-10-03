import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  validateIsni,
  validateGrid,
  validateOwnershipSplit,
  InMemoryIdentifierStore,
  FileApprovalStore,
  ApprovalGate,
  deliverErn
} from '../src/index.js'
import { REQUIRED_ENV, getRuntimeConfig } from '../src/config.js'

function validRelease(overrides = {}) {
  return {
    messageId: 'DMF-20260920-001',
    senderPartyId: 'DMF-RELEASE-SENDER',
    senderName: 'DMF Records',
    title: 'Midnight Echo',
    artist: 'DMF Artist',
    isrc: 'USDMF2600001',
    upc: '123456789012',
    duration: 'PT2M45S',
    owners: [{ name: 'DMF Records', share: 100 }],
    releaseId: 'REL-PIPELINE',
    ...overrides
  }
}

test('identifier validators handle malformed and edge-case input', () => {
  assert.equal(validateIsni('0000122819550'), false)
  assert.equal(validateIsni('00001228195XX'), false)
  assert.equal(validateIsni(123), false)
  assert.equal(validateGrid('A B'), false)
  assert.equal(validateGrid('ABCDE'), false)
  assert.equal(validateGrid('A1B2C3D4E5F6G7H8I9J0K1'), true)
  assert.equal(validateOwnershipSplit([]), false)
  assert.equal(validateOwnershipSplit([{ name: '   ', share: 100 }]), false)
  assert.equal(validateOwnershipSplit([{ name: 'DMF Records', share: -10 }]), false)
})

test('identifier store records creation metadata and supports lookup', () => {
  const registry = new InMemoryIdentifierStore()
  const record = registry.create(validRelease())

  assert.match(record.id, /^[0-9a-f-]{36}$/)
  assert.ok(!Number.isNaN(Date.parse(record.createdAt)))
  assert.equal(registry.get('123456789012').messageId, 'DMF-20260920-001')
})

test('approval gate fails closed for expired and unknown approval statuses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-approvals-'))
  const store = new FileApprovalStore(path.join(dir, 'approvals.json'))

  store.write({
    approvals: [{
      releaseId: 'REL-EXPIRED',
      status: 'approved',
      approvedBy: 'ops',
      expiresAt: '2000-01-01T00:00:00.000Z'
    }]
  })
  assert.match(
    new ApprovalGate(store).canDeliver({ releaseId: 'REL-EXPIRED' }).reason,
    /expired/i
  )

  store.write({ approvals: [{ releaseId: 'REL-UNKNOWN', status: 'on-hold' }] })
  assert.match(
    new ApprovalGate(store).canDeliver({ releaseId: 'REL-UNKNOWN' }).reason,
    /unknown/i
  )
})

test('a corrupt approval export denies delivery instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-corrupt-'))
  const file = path.join(dir, 'approvals.json')
  fs.writeFileSync(file, '{ not json')

  assert.equal(new ApprovalGate(new FileApprovalStore(file)).canDeliver({ releaseId: 'REL-1' }).approved, false)
})

test('delivery gate cannot be bypassed: an unapproved release never writes output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-deliver-'))
  const approvalFile = path.join(dir, 'approvals.json')
  const outputPath = path.join(dir, 'dist', 'ern-output.xml')
  const release = validRelease({ releaseId: 'REL-NOT-APPROVED' })

  const pending = new FileApprovalStore(approvalFile)
  pending.write({ approvals: [{ releaseId: 'REL-NOT-APPROVED', status: 'pending', approvedBy: 'ops' }] })

  const result = deliverErn(release, { approvalFile, outputPath })

  assert.equal(result.approved, false)
  assert.equal(result.outputPath, null)
  assert.equal(result.xml, null)
  assert.equal(fs.existsSync(outputPath), false)
})

test('approved releases deliver an escaped, well-formed ERN document', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-ern-'))
  const approvalFile = path.join(dir, 'approvals.json')
  const outputPath = path.join(dir, 'dist', 'ern-output.xml')

  const store = new FileApprovalStore(approvalFile)
  store.write({
    approvals: [{
      releaseId: 'REL-APPROVED',
      status: 'approved',
      approvedBy: 'ops',
      expiresAt: '2999-01-01T00:00:00.000Z'
    }]
  })

  const result = deliverErn(
    validRelease({
      releaseId: 'REL-APPROVED',
      title: 'Rock & Roll <Live>',
      owners: [{ name: 'A & B Publishing', share: 40 }, { name: 'DMF Records', share: 60 }]
    }),
    { approvalFile, outputPath }
  )

  assert.equal(result.approved, true)
  assert.equal(fs.readFileSync(result.outputPath, 'utf8'), result.xml)
  assert.ok(!result.xml.includes('Rock & Roll <Live>'))
  assert.ok(result.xml.includes('Rock &amp; Roll &lt;Live&gt;'))
  assert.ok(result.xml.includes('A &amp; B Publishing'))
  assert.equal((result.xml.match(/<SharePercentage>/g) || []).length, 2)
})

test('runtime config blocks production when required values are missing', () => {
  assert.throws(() => getRuntimeConfig({ NODE_ENV: 'production' }), /missing required values/i)
})

test('runtime config accepts a complete production environment', () => {
  const env = { NODE_ENV: 'production' }
  for (const key of REQUIRED_ENV) env[key] = 'value'
  env.DMF_OWNER_SHARE = '100'

  const config = getRuntimeConfig(env)

  assert.equal(config.nodeEnv, 'production')
  assert.deepEqual(config.missing, [])
  assert.deepEqual(config.release.owners, [{ name: 'value', share: 100 }])
})

test('runtime config reports missing keys without throwing in development', () => {
  const config = getRuntimeConfig({ NODE_ENV: 'development' })

  assert.equal(config.nodeEnv, 'development')
  assert.deepEqual(config.missing, REQUIRED_ENV)
})
