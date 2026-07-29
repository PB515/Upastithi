-- 0004_events_and_attendance — events, event_access_tokens, attendees, audit_log.
-- Schema + RLS verbatim from docs/data-model-security.md §3/§4 (frozen doc,
-- Safety Rail 7 — this migration implements it, doesn't redesign it).
--
-- event_access_tokens gets RLS enabled with ZERO policies for any client
-- role, admin included — that is intentional (§5.6), not a gap: token_hash
-- and short_code_hash must never be readable via PostgREST by anyone, only
-- via the service-role client in reviewed server code (verification flow,
-- admin generate/revoke/extend). Do not add a policy to this table.

-- migrate:up

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  event_date  date not null,
  location    text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table events enable row level security;

create policy "staff can read events"
  on events for select
  using (has_role('admin') or has_role('viewer'));

create policy "admins manage events"
  on events for all
  using (has_role('admin'))
  with check (has_role('admin'));

create table if not exists event_access_tokens (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  label            text,
  token_hash       text not null unique,
  short_code_hash  text not null unique,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users(id),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  extended_at      timestamptz,
  extended_by      uuid references auth.users(id)
);
create index if not exists event_access_tokens_event_id_idx on event_access_tokens(event_id);

alter table event_access_tokens enable row level security;
-- No policies on this table for any role, on purpose. All access is via the
-- service-role client in reviewed server code (data-model-security.md §5.6).

create table if not exists attendees (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,
  phone       text,
  present     boolean not null default false,
  remarks     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists attendees_event_id_idx on attendees(event_id);

alter table attendees enable row level security;

create policy "staff can read attendees"
  on attendees for select
  using (has_role('admin') or has_role('viewer'));

create policy "admins manage attendees"
  on attendees for all
  using (has_role('admin'))
  with check (has_role('admin'));
-- Management (no session) never touches this table directly — reads/writes
-- go through the service-role client, scoped server-side to one event_id
-- verified from the access token (data-model-security.md §5.4). No anon
-- policy exists here on purpose; anon must get nothing via PostgREST.

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "admins read audit log"
  on audit_log for select
  using (has_role('admin'));

create policy "admins write audit log"
  on audit_log for insert
  with check (has_role('admin'));
-- No update/delete policy for anyone, including admin — append-only,
-- enforced by omission (data-model-security.md §7). Viewer gets no policy
-- here at all — confirmed deny (§4/§9, resolved open item).

-- migrate:down
drop policy if exists "admins write audit log" on audit_log;
drop policy if exists "admins read audit log" on audit_log;
drop table if exists audit_log;

drop policy if exists "admins manage attendees" on attendees;
drop policy if exists "staff can read attendees" on attendees;
drop table if exists attendees;

drop table if exists event_access_tokens;

drop policy if exists "admins manage events" on events;
drop policy if exists "staff can read events" on events;
drop table if exists events;
