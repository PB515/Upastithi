-- 0003_roles — staff table + has_role() RLS helper.
-- Per docs/data-model-security.md §2. Adapted from lib/patterns/has_role.sql:
-- table renamed `staff` (not the template's generic `user_roles`) to keep the
-- domain vocabulary — "admin" and "viewer" are staff, not a generic role list.

-- migrate:up

create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'viewer')),
  created_at  timestamptz not null default now()
);

alter table staff enable row level security;

create policy "staff can read own row"
  on staff for select
  using (user_id = auth.uid());

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = auth.uid()
      and s.role = required_role
  );
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated;

-- Admin gets full CRUD (select/insert/update/delete) via a single FOR ALL
-- policy — Postgres's CREATE POLICY FOR clause takes exactly one of
-- ALL/SELECT/INSERT/UPDATE/DELETE, not a comma-separated list, so this is
-- one policy, not three. It OR's harmlessly with "staff can read own row"
-- for the select case.
create policy "admins manage staff"
  on staff for all
  using (has_role('admin'))
  with check (has_role('admin'));

-- migrate:down
drop policy if exists "admins manage staff" on staff;
drop function if exists public.has_role(text);
drop policy if exists "staff can read own row" on staff;
drop table if exists staff;
