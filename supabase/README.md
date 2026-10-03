# supabase/

Scaffolding only. Nothing in this directory runs.

These folders are reserved namespaces. There is no Supabase project connected to
this repository, no Edge Function implementations, and no migrations — creating a
folder does not create a capability.

## What is here

- `migrations/` — empty. The schema migration is **not written**.
- `functions/{ai,analytics,royalties,campaigns,notifications,video}/` — empty.
  No Edge Function code exists.

## What is blocking the migration

The RLS policies are the reason this is not written yet. A policy mistake in
Postgres Row Level Security does not throw — it either exposes one artist's rows
to another artist, or returns zero rows and looks like an empty database. It has
to be written against the real schema, and the schema proposed so far references
`artists.user_id` in a policy while the `artists` table definition does not
declare that column.

To unblock, provide one of:

```sql
\d artists
\d stream_metrics
```

from the live project, or the existing files in `supabase/migrations/`.

## What is already built

The working code lives in `/src`, not here:

| Path | Status |
|---|---|
| `src/identifiers/` | Working — UPC, ISRC, ISNI, GRID validation |
| `src/ern/` | Working — DDEX ERN generation and delivery |
| `src/approvals/` | Working — fail-closed approval gate |
| `src/roster/` | Working — artist registry, sourced-metric enforcement |
| `src/studio/` | Working — session model, mix checks, export manifests |
| `src/video/` | Working — scene planning, render queue, provider adapters |

Run `npm test` for the unit suite and `npm run smoke` (with the server up) for
the end-to-end API checks.
