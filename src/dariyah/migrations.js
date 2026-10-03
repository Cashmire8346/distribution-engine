// Da'Riyah Engineering - migration approval gate.
//
// Division 3 generates schema changes. This module is the precondition for
// ever running them: a migration is INERT DATA until this gate approves it.
//
// The hazard being guarded against is specific. A wrong RLS policy does not
// throw - it either exposes one artist's rows to another, or returns zero rows
// and looks like an empty database. Neither failure is visible at apply time.
// So the rule here is: nothing applies without a matching, unexpired approval,
// and anything touching a security policy or a destructive statement needs an
// explicit flag on the approval.
//
// This gate does NOT generate migrations and does NOT connect to Postgres. It
// decides whether a migration may be applied. Applying it is a separate step
// that does not exist in this repository.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const MIGRATION_KINDS = Object.freeze(['schema', 'data', 'policy', 'index'])

// Statements that destroy data. An approval must opt in with allowDestructive.
const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bdrop\s+table\b/i, label: 'DROP TABLE' },
  { pattern: /\bdrop\s+column\b/i, label: 'DROP COLUMN' },
  { pattern: /\bdrop\s+schema\b/i, label: 'DROP SCHEMA' },
  { pattern: /\btruncate\b/i, label: 'TRUNCATE' },
  { pattern: /\bdelete\s+from\b/i, label: 'DELETE FROM' },
  { pattern: /\bdisable\s+row\s+level\s+security\b/i, label: 'DISABLE ROW LEVEL SECURITY' },
  { pattern: /\bdrop\s+policy\b/i, label: 'DROP POLICY' }
]

// Statements that change who can see what.
const POLICY_PATTERNS = [
  { pattern: /\brow\s+level\s+security\b/i, label: 'ROW LEVEL SECURITY' },
  { pattern: /\bcreate\s+policy\b/i, label: 'CREATE POLICY' },
  { pattern: /\balter\s+policy\b/i, label: 'ALTER POLICY' },
  { pattern: /\bgrant\b/i, label: 'GRANT' },
  { pattern: /\brevoke\b/i, label: 'REVOKE' },
  { pattern: /\bsecurity\s+definer\b/i, label: 'SECURITY DEFINER' }
]

export class MigrationGateError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'MigrationGateError'
    Object.assign(this, details)
  }
}

// Deterministic digest of the migration body. An approval is bound to this, so
// editing the SQL after approval invalidates the approval.
export function digestSql(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new MigrationGateError('sql is required', { field: 'sql' })
  }
  return crypto.createHash('sha256').update(sql).digest('hex')
}

export function analyseMigration(sql) {
  const destructive = DESTRUCTIVE_PATTERNS.filter((p) => p.pattern.test(sql)).map((p) => p.label)
  const policy = POLICY_PATTERNS.filter((p) => p.pattern.test(sql)).map((p) => p.label)

  return {
    digest: digestSql(sql),
    destructive,
    policy,
    touchesSecurity: policy.length > 0,
    isDestructive: destructive.length > 0
  }
}

export function createMigration(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new MigrationGateError('migration must be an object', { field: 'migration' })
  }
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    throw new MigrationGateError('migration.name is required', { field: 'name' })
  }
  if (!MIGRATION_KINDS.includes(input.kind)) {
    throw new MigrationGateError(`migration.kind must be one of ${MIGRATION_KINDS.join(', ')}`, { field: 'kind' })
  }

  const sql = input.sql
  const analysis = analyseMigration(sql)

  return Object.freeze({
    id: input.id || crypto.randomUUID(),
    name: input.name.trim(),
    kind: input.kind,
    sql,
    // Provenance. When a model writes the migration, these record which one.
    author: input.author || 'human',
    model: input.model ?? null,
    createdAt: new Date().toISOString(),
    analysis
  })
}

export class MigrationApprovalStore {
  #file

  constructor(filePath) {
    this.#file = filePath
    this.#data = { approvals: [], applied: [] }
  }

  #data

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.#file, 'utf8'))
      if (parsed && Array.isArray(parsed.approvals)) {
        this.#data = { approvals: parsed.approvals, applied: Array.isArray(parsed.applied) ? parsed.applied : [] }
      }
    } catch {
      // A corrupt or missing store means no approvals exist, which denies
      // everything. That is the correct fail-closed behaviour.
      this.#data = { approvals: [], applied: [] }
    }
    return { ...this.#data, approvals: [...this.#data.approvals], applied: [...this.#data.applied] }
  }

  write(data) {
    fs.mkdirSync(path.dirname(path.resolve(this.#file)), { recursive: true })
    fs.writeFileSync(this.#file, JSON.stringify(data, null, 2))
    this.#data = data
    return data
  }

  approve(entry) {
    const current = this.read()
    const next = { ...current, approvals: [...current.approvals, entry] }
    return this.write(next)
  }

  recordApplied(entry) {
    const current = this.read()
    const next = { ...current, applied: [...current.applied, entry] }
    return this.write(next)
  }
}

export class MigrationGate {
  #store

  constructor(store) {
    this.#store = store
  }

  // Approves a migration, binding the approval to its digest. Destructive and
  // security-touching migrations must be acknowledged explicitly.
  approve(migration, { approvedBy, expiresAt, allowDestructive = false, allowSecurityChange = false } = {}) {
    if (!approvedBy || String(approvedBy).trim() === '') {
      throw new MigrationGateError('approvedBy is required', { field: 'approvedBy' })
    }

    if (migration.analysis.isDestructive && !allowDestructive) {
      throw new MigrationGateError(
        `Refusing to approve a destructive migration (${migration.analysis.destructive.join(', ')}) without allowDestructive`,
        { field: 'allowDestructive', destructive: migration.analysis.destructive }
      )
    }

    if (migration.analysis.touchesSecurity && !allowSecurityChange) {
      throw new MigrationGateError(
        `Refusing to approve a migration that changes access control (${migration.analysis.policy.join(', ')}) without allowSecurityChange`,
        { field: 'allowSecurityChange', policy: migration.analysis.policy }
      )
    }

    return this.#store.approve({
      migrationId: migration.id,
      name: migration.name,
      digest: migration.analysis.digest,
      approvedBy: String(approvedBy),
      expiresAt: expiresAt ?? null,
      author: migration.author,
      model: migration.model,
      approvedAt: new Date().toISOString()
    })
  }

  // The decision. `canApply` is false unless every condition holds.
  canApply(migration) {
    const { approvals, applied } = this.#store.read()

    const record = approvals.find((entry) => entry.migrationId === migration.id)
    if (!record) {
      return { canApply: false, reason: 'No approval record for this migration.' }
    }

    // The SQL may have changed since approval. A digest mismatch means the
    // approval was for different content.
    if (record.digest !== migration.analysis.digest) {
      return { canApply: false, reason: 'Migration SQL has changed since it was approved.' }
    }

    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      return { canApply: false, reason: 'Approval has expired.' }
    }

    if (applied.some((entry) => entry.migrationId === migration.id && entry.digest === migration.analysis.digest)) {
      return { canApply: false, reason: 'Migration has already been applied.' }
    }

    return { canApply: true, approval: record }
  }

  // Applying is deliberately unimplemented. This gate only decides.
  apply() {
    throw new MigrationGateError(
      'Applying migrations is not implemented. This gate decides whether a migration MAY be applied; it has no database connection.',
      { field: 'apply', implemented: false }
    )
  }

  // Marks a migration applied. Called by whatever applies it, after the fact.
  markApplied(migration, { appliedBy } = {}) {
    const decision = this.canApply(migration)
    if (!decision.canApply) {
      throw new MigrationGateError(`Refusing to mark applied: ${decision.reason}`, { field: 'markApplied' })
    }

    return this.#store.recordApplied({
      migrationId: migration.id,
      digest: migration.analysis.digest,
      appliedBy: appliedBy ? String(appliedBy) : decision.approval.approvedBy,
      appliedAt: new Date().toISOString()
    })
  }
}
