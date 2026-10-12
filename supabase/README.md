# supabase/

## Status

| Item | State |
|---|---|
| `migrations/20261012000000_initial_schema.sql` | **Written and tested, not applied.** |
| Live project `dmf` (`xgwwldplsdatuxdhapnn`) | Empty `public` schema as of 2026-10-12. |
| `functions/*` | Empty. No Edge Function code exists. |

## The migration

Creates `staff_members`, `artists`, `stream_metrics`, `releases`,
`release_approvals`, `audit_events`, and `is_staff()`. Every table has RLS
enabled.

`artists.user_id` is declared in the table definition, which was the defect in
the earlier proposal. Policies key on it.

| Role | Access |
|---|---|
| staff (row in `staff_members`) | read/write label data; read/insert audit log |
| artist (`artists.user_id = auth.uid()`) | read-only, own artist row and rows under it |
| other authenticated user | nothing |
| anon | nothing (no grants) |

The audit log has no update or delete grant or policy. `release_approvals` has
no delete policy. `staff_members` has no client policies at all; manage it with
the service role.

## Verifying

`test/supabase-schema.test.js` runs the real SQL in an in-process Postgres
(PGlite) against a stub of Supabase's `auth` schema and impersonates users. It
checks that an artist cannot see another artist's rows, that a non-member sees
nothing, that anon is refused, that artists cannot approve their own release,
and that the audit log is append-only.

```
npm test
```

PGlite is not Supabase. Run the project's security advisors after applying.

## Applying

Nothing applies without a matching approval. The file creates policies and a
`SECURITY DEFINER` function, so `analyseMigration()` flags it as
`touchesSecurity` and the approval must carry the policy flag. Editing the file
changes its digest and voids any approval.

After approval, apply it with the Supabase CLI (`supabase db push`) or the
Supabase MCP `apply_migration` tool, then run the advisors.

To make a user staff (service role only):

```sql
insert into public.staff_members (user_id) values ('<auth.users id>');
```
