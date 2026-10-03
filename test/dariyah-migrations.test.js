import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  MigrationGate,
  MigrationApprovalStore,
  MigrationGateError,
  analyseMigration,
  createMigration,
  digestSql
} from '../src/index.js'

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-migrate-'))
  return new MigrationApprovalStore(path.join(dir, 'approvals.json'))
}

const SAFE_SQL = 'create table artists (id uuid primary key);'

test('migration analysis detects destructive and security statements', () => {
  assert.deepEqual(analyseMigration(SAFE_SQL).destructive, [])
  assert.equal(analyseMigration(SAFE_SQL).touchesSecurity, false)

  const drop = analyseMigration('drop table artists;')
  assert.ok(drop.destructive.includes('DROP TABLE'))
  assert.equal(drop.isDestructive, true)

  const policy = analyseMigration('create policy "own rows" on artists for select using (true);')
  assert.ok(policy.policy.includes('CREATE POLICY'))
  assert.equal(policy.touchesSecurity, true)
})

test('a migration requires a name and a known kind', () => {
  assert.throws(() => createMigration({ kind: 'schema', sql: SAFE_SQL }), /name is required/)
  assert.throws(() => createMigration({ name: 'x', kind: 'vibes', sql: SAFE_SQL }), /kind must be one of/)
  assert.throws(() => createMigration({ name: 'x', kind: 'schema', sql: '' }), /sql is required/)
})

test('the approved digest is bound to the SQL content', () => {
  const first = createMigration({ name: 'a', kind: 'schema', sql: SAFE_SQL })
  const second = createMigration({ name: 'b', kind: 'schema', sql: 'create table other (id uuid);' })

  assert.equal(first.analysis.digest, digestSql(SAFE_SQL))
  assert.notEqual(first.analysis.digest, second.analysis.digest)
})

test('an approved, unexpired migration may be applied', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'add tracks', kind: 'schema', sql: SAFE_SQL })

  gate.approve(migration, { approvedBy: 'deangelo', expiresAt: '2999-01-01T00:00:00.000Z' })

  const decision = gate.canApply(migration)
  assert.equal(decision.canApply, true)
  assert.equal(decision.approval.approvedBy, 'deangelo')
})

test('an unapproved migration is refused', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  assert.equal(gate.canApply(migration).canApply, false)
  assert.match(gate.canApply(migration).reason, /No approval record/)
})

test('editing the SQL after approval invalidates the approval', () => {
  const store = tempStore()
  const gate = new MigrationGate(store)
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  gate.approve(migration, { approvedBy: 'deangelo' })

  // Same id, different body - the digest no longer matches.
  const tampered = createMigration({ id: migration.id, name: 'x', kind: 'schema', sql: 'drop table artists;' })

  const decision = gate.canApply(tampered)
  assert.equal(decision.canApply, false)
  assert.match(decision.reason, /changed since it was approved/)
})

test('an expired approval is refused', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  gate.approve(migration, { approvedBy: 'deangelo', expiresAt: '2000-01-01T00:00:00.000Z' })

  assert.equal(gate.canApply(migration).canApply, false)
  assert.match(gate.canApply(migration).reason, /expired/)
})

test('a destructive migration cannot be approved without explicit opt-in', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'cleanup', kind: 'data', sql: 'drop table artists;' })

  assert.throws(() => gate.approve(migration, { approvedBy: 'deangelo' }), /destructive migration/)

  gate.approve(migration, { approvedBy: 'deangelo', allowDestructive: true })
  assert.equal(gate.canApply(migration).canApply, true)
})

test('a security-touching migration cannot be approved without explicit opt-in', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({
    name: 'policy',
    kind: 'policy',
    sql: 'create policy p on artists for select using (auth.uid() = user_id);'
  })

  assert.throws(() => gate.approve(migration, { approvedBy: 'deangelo' }), /changes access control/)

  gate.approve(migration, { approvedBy: 'deangelo', allowSecurityChange: true })
  assert.equal(gate.canApply(migration).canApply, true)
})

test('an approval requires a named approver', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  assert.throws(() => gate.approve(migration, {}), /approvedBy is required/)
})

test('an applied migration cannot be applied twice', () => {
  const gate = new MigrationGate(tempStore())
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  gate.approve(migration, { approvedBy: 'deangelo' })
  gate.markApplied(migration, { appliedBy: 'deangelo' })

  const decision = gate.canApply(migration)
  assert.equal(decision.canApply, false)
  assert.match(decision.reason, /already been applied/)
})

test('a corrupt approval store denies everything instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmf-corrupt-mig-'))
  const file = path.join(dir, 'approvals.json')
  fs.writeFileSync(file, '{ not json')

  const gate = new MigrationGate(new MigrationApprovalStore(file))
  const migration = createMigration({ name: 'x', kind: 'schema', sql: SAFE_SQL })

  assert.equal(gate.canApply(migration).canApply, false)
})

test('applying is unimplemented and the gate says so', () => {
  const gate = new MigrationGate(tempStore())

  assert.throws(() => gate.apply(), MigrationGateError)
  assert.throws(() => gate.apply(), /Applying migrations is not implemented/)
})
