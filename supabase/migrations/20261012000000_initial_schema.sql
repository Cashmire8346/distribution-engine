-- DMF Distribution Engine - initial schema + row level security.
--
-- STATUS: written, NOT applied. Per ARCHITECTURE.md and src/dariyah/migrations.js,
-- this file is inert data until the MigrationGate holds a matching, unexpired
-- approval for its digest with allowPolicy set (it creates policies and a
-- SECURITY DEFINER function). Editing this file invalidates any approval.
--
-- Access model
--   staff    -> rows in public.staff_members. Full read/write on label data.
--   artist   -> an authenticated user whose id equals artists.user_id. Read-only,
--               and only their own artist row and the rows hanging off it.
--   anon     -> nothing. No grants, no policies.
--   service  -> bypasses RLS (Supabase service_role); used by server-side jobs.
--
-- Every table has RLS enabled. A table with RLS on and no matching policy
-- returns zero rows, which is the intended default for anything not listed.

-- ---------------------------------------------------------------------------
-- Staff registry
-- ---------------------------------------------------------------------------
create table public.staff_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;
-- No policies on purpose: clients cannot read or edit the staff list. Staff
-- membership is managed with the service role only.

-- SECURITY DEFINER so policies on other tables can consult staff_members
-- without granting clients any access to it. search_path is pinned so the
-- function cannot be hijacked by a shadowing object.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members s where s.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Artists
-- ---------------------------------------------------------------------------
create table public.artists (
  id         uuid primary key default gen_random_uuid(),
  -- The artist's own login, if they have one. Nullable: most roster artists
  -- will not have an account. This is the column the policies below key on.
  user_id    uuid unique references auth.users (id) on delete set null,
  name       text not null check (btrim(name) <> ''),
  role       text not null check (role in ('owner', 'core', 'affiliate')),
  location   text,
  vibe       text,
  bio        text,
  spotify_id text check (spotify_id ~ '^[0-9A-Za-z]{22}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artists_name_key unique (name)
);

alter table public.artists enable row level security;

create policy artists_select on public.artists
  for select to authenticated
  using ((select public.is_staff()) or user_id = (select auth.uid()));

create policy artists_insert on public.artists
  for insert to authenticated
  with check ((select public.is_staff()));

create policy artists_update on public.artists
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy artists_delete on public.artists
  for delete to authenticated
  using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Stream metrics
-- Mirrors src/roster: a metric is never a bare number. It carries a source and
-- an as_of timestamp, and the database refuses rows without them.
-- ---------------------------------------------------------------------------
create table public.stream_metrics (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.artists (id) on delete cascade,
  source      text not null
              check (source in ('spotify', 'apple', 'youtube', 'amazon', 'tidal', 'chartmetric', 'manual')),
  metric_type text not null check (btrim(metric_type) <> ''),
  value       bigint not null check (value >= 0),
  as_of       timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint stream_metrics_reading_key unique (artist_id, source, metric_type, as_of)
);

create index stream_metrics_artist_id_idx on public.stream_metrics (artist_id);

alter table public.stream_metrics enable row level security;

create policy stream_metrics_select on public.stream_metrics
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.artists a
      where a.id = stream_metrics.artist_id and a.user_id = (select auth.uid())
    )
  );

create policy stream_metrics_insert on public.stream_metrics
  for insert to authenticated
  with check ((select public.is_staff()));

create policy stream_metrics_update on public.stream_metrics
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy stream_metrics_delete on public.stream_metrics
  for delete to authenticated
  using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------
create table public.releases (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid not null references public.artists (id) on delete restrict,
  title      text not null check (btrim(title) <> ''),
  upc        text check (upc ~ '^[0-9]{12,14}$'),
  isrc       text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  status     text not null default 'draft'
             check (status in ('draft', 'validated', 'approved', 'delivered', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index releases_artist_id_idx on public.releases (artist_id);

alter table public.releases enable row level security;

create policy releases_select on public.releases
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.artists a
      where a.id = releases.artist_id and a.user_id = (select auth.uid())
    )
  );

create policy releases_insert on public.releases
  for insert to authenticated
  with check ((select public.is_staff()));

create policy releases_update on public.releases
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy releases_delete on public.releases
  for delete to authenticated
  using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Release approvals
-- The persistent form of src/approvals: deny by default. A release with no row
-- here, or a row that is not 'approved' and unexpired, must not be delivered.
-- ---------------------------------------------------------------------------
create table public.release_approvals (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references public.releases (id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users (id) on delete set null,
  expires_at  timestamptz,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint release_approvals_release_key unique (release_id),
  -- An approval or rejection must say who made it and when.
  constraint release_approvals_decision_check check (
    status = 'pending' or (approved_by is not null and decided_at is not null)
  )
);

alter table public.release_approvals enable row level security;

create policy release_approvals_select on public.release_approvals
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1
      from public.releases r
      join public.artists a on a.id = r.artist_id
      where r.id = release_approvals.release_id and a.user_id = (select auth.uid())
    )
  );

create policy release_approvals_insert on public.release_approvals
  for insert to authenticated
  with check ((select public.is_staff()));

create policy release_approvals_update on public.release_approvals
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
-- No delete policy: approval history is not removable through the API.

-- ---------------------------------------------------------------------------
-- Audit events - append only
-- Staff can read and insert. There is no update or delete policy, and the
-- table privileges below do not grant them either (belt and braces).
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id         bigint generated always as identity primary key,
  event      text not null check (btrim(event) <> ''),
  actor_id   uuid references auth.users (id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

create policy audit_events_select on public.audit_events
  for select to authenticated
  using ((select public.is_staff()));

create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check ((select public.is_staff()) and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges. RLS decides which rows; grants decide which verbs are possible at
-- all. anon gets nothing.
-- ---------------------------------------------------------------------------
revoke all on public.staff_members, public.artists, public.stream_metrics,
  public.releases, public.release_approvals, public.audit_events
  from anon, authenticated;

grant select, insert, update, delete on public.artists to authenticated;
grant select, insert, update, delete on public.stream_metrics to authenticated;
grant select, insert, update, delete on public.releases to authenticated;
grant select, insert, update on public.release_approvals to authenticated;
grant select, insert on public.audit_events to authenticated;
