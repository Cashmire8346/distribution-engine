// Executes the real migration in an in-process Postgres (PGlite) and checks
// row level security by impersonating users. This exists because an RLS mistake
// does not throw: it leaks rows or silently returns none. See supabase/README.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

import { analyseMigration } from '../src/dariyah/migrations.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'supabase', 'migrations')
const migrationFile = fs.readdirSync(migrationsDir).find((f) => f.endsWith('.sql'))
const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8')

const STAFF = '00000000-0000-4000-8000-000000000001'
const ARTIST_A = '00000000-0000-4000-8000-0000000000a1'
const ARTIST_B = '00000000-0000-4000-8000-0000000000b2'
const STRANGER = '00000000-0000-4000-8000-0000000000c3'

// Minimal stand-in for what Supabase provides: roles, auth.users, auth.uid().
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`

async function freshDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  await db.exec(sql)
  await db.exec(`
    insert into auth.users (id) values
      ('${STAFF}'), ('${ARTIST_A}'), ('${ARTIST_B}'), ('${STRANGER}');
    insert into public.staff_members (user_id) values ('${STAFF}');
    insert into public.artists (id, user_id, name, role) values
      ('a0000000-0000-4000-8000-000000000001', '${ARTIST_A}', 'Artist A', 'core'),
      ('b0000000-0000-4000-8000-000000000002', '${ARTIST_B}', 'Artist B', 'core'),
      ('c0000000-0000-4000-8000-000000000003', null, 'No Login', 'affiliate');
    insert into public.stream_metrics (artist_id, source, metric_type, value, as_of) values
      ('a0000000-0000-4000-8000-000000000001', 'spotify', 'monthly_listeners', 10, now()),
      ('b0000000-0000-4000-8000-000000000002', 'spotify', 'monthly_listeners', 20, now());
    insert into public.releases (id, artist_id, title) values
      ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'A single'),
      ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'B single');
    insert into public.release_approvals (release_id) values
      ('d0000000-0000-4000-8000-000000000001'),
      ('d0000000-0000-4000-8000-000000000002');
  `)
  return db
}

// Run `fn` as a given user/role, then drop back to the superuser.
async function as(db, role, userId, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}

const count = async (db, table) => Number((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n)

test('migration is gated: touches security, is not destructive', () => {
  const analysis = analyseMigration(sql)
  assert.equal(analysis.touchesSecurity, true)
  assert.ok(analysis.policy.includes('CREATE POLICY'))
  assert.ok(analysis.policy.includes('SECURITY DEFINER'))
  assert.equal(analysis.isDestructive, false, `unexpected destructive statements: ${analysis.destructive}`)
  assert.match(analysis.digest, /^[0-9a-f]{64}$/)
})

test('artists declares the user_id column the policies depend on', async () => {
  const db = await freshDb()
  const { rows } = await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'artists' and column_name = 'user_id'`
  )
  assert.equal(rows.length, 1)
})

test('every public table has RLS enabled and at least one policy except staff_members', async () => {
  const db = await freshDb()
  const tables = (
    await db.query(
      `select c.relname, c.relrowsecurity,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`
    )
  ).rows
  assert.ok(tables.length >= 6)
  for (const t of tables) {
    assert.equal(t.relrowsecurity, true, `${t.relname} must have RLS enabled`)
    if (t.relname === 'staff_members') assert.equal(t.policies, 0, 'staff_members must have no client policies')
    else assert.ok(t.policies > 0, `${t.relname} has RLS on but no policies`)
  }
})

test('staff can read everything', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', STAFF, async () => {
    assert.equal(await count(db, 'public.artists'), 3)
    assert.equal(await count(db, 'public.stream_metrics'), 2)
    assert.equal(await count(db, 'public.releases'), 2)
    assert.equal(await count(db, 'public.release_approvals'), 2)
  })
})

test('an artist sees only their own rows, never another artist\'s', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', ARTIST_A, async () => {
    const artists = (await db.query('select name from public.artists')).rows.map((r) => r.name)
    assert.deepEqual(artists, ['Artist A'])
    assert.equal(await count(db, 'public.stream_metrics'), 1)
    assert.equal(await count(db, 'public.releases'), 1)
    assert.equal(await count(db, 'public.release_approvals'), 1)
    const leaked = await db.query(
      `select 1 from public.stream_metrics where artist_id = 'b0000000-0000-4000-8000-000000000002'`
    )
    assert.equal(leaked.rows.length, 0)
  })
})

test('an authenticated user who is neither staff nor an artist sees nothing', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', STRANGER, async () => {
    for (const t of ['artists', 'stream_metrics', 'releases', 'release_approvals', 'audit_events']) {
      assert.equal(await count(db, `public.${t}`), 0, `${t} leaked rows to a non-member`)
    }
  })
})

test('anon has no access at all', async () => {
  const db = await freshDb()
  await as(db, 'anon', null, async () => {
    await assert.rejects(() => db.query('select * from public.artists'), /permission denied/)
  })
})

test('artists cannot write; their updates and inserts are refused', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', ARTIST_A, async () => {
    const upd = await db.query(`update public.artists set bio = 'hacked' where user_id = '${ARTIST_A}'`)
    assert.equal(upd.affectedRows, 0, 'artist update must match zero rows')
    await assert.rejects(
      () => db.query(`insert into public.stream_metrics (artist_id, source, metric_type, value, as_of)
                      values ('a0000000-0000-4000-8000-000000000001', 'manual', 'monthly_listeners', 999999, now())`),
      /row-level security/
    )
    // An UPDATE no policy admits matches zero rows rather than throwing.
    const approve = await db.query(`update public.release_approvals set status = 'approved'`)
    assert.equal(approve.affectedRows, 0)
  })
  const { rows } = await db.query(`select status from public.release_approvals where release_id = 'd0000000-0000-4000-8000-000000000001'`)
  assert.equal(rows[0].status, 'pending', 'an artist must not be able to approve their own release')
})

test('approval decisions must record who and when', async () => {
  const db = await freshDb()
  await assert.rejects(
    () => db.query(`update public.release_approvals set status = 'approved'`),
    /release_approvals_decision_check/
  )
  await db.query(
    `update public.release_approvals set status = 'approved', approved_by = '${STAFF}', decided_at = now()
     where release_id = 'd0000000-0000-4000-8000-000000000001'`
  )
})

test('metrics are never bare numbers: bad source, negative value, missing as_of are rejected', async () => {
  const db = await freshDb()
  const id = 'a0000000-0000-4000-8000-000000000001'
  await assert.rejects(
    () => db.query(`insert into public.stream_metrics (artist_id, source, metric_type, value, as_of) values ('${id}', 'guess', 'x', 1, now())`),
    /check constraint/
  )
  await assert.rejects(
    () => db.query(`insert into public.stream_metrics (artist_id, source, metric_type, value, as_of) values ('${id}', 'spotify', 'x', -1, now())`),
    /check constraint/
  )
  await assert.rejects(
    () => db.query(`insert into public.stream_metrics (artist_id, source, metric_type, value) values ('${id}', 'spotify', 'x', 1)`),
    /not-null/
  )
})

test('audit log is append-only for staff, and the actor must be the caller', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', STAFF, async () => {
    await db.query(`insert into public.audit_events (event, actor_id) values ('release.approved', '${STAFF}')`)
    await assert.rejects(
      () => db.query(`insert into public.audit_events (event, actor_id) values ('forged', '${ARTIST_A}')`),
      /row-level security/
    )
    await assert.rejects(() => db.query(`update public.audit_events set event = 'edited'`), /permission denied/)
    await assert.rejects(() => db.query('delete from public.audit_events'), /permission denied/)
    assert.equal(await count(db, 'public.audit_events'), 1)
  })
})

test('clients cannot read or edit the staff list', async () => {
  const db = await freshDb()
  await as(db, 'authenticated', ARTIST_A, async () => {
    await assert.rejects(() => db.query('select * from public.staff_members'), /permission denied/)
    await assert.rejects(
      () => db.query(`insert into public.staff_members (user_id) values ('${ARTIST_A}')`),
      /permission denied/
    )
  })
})
