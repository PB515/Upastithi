-- 0005_table_grants — explicit table-level GRANTs for staff/events/attendees/
-- audit_log/event_access_tokens.
--
-- Why this is a separate migration, not folded into 0003/0004: those are
-- already applied (Safety Rail / docs/runbooks/migrations.md — never edit an
-- applied migration, write a new one). Discovered while seeding local test
-- users: this migration runner connects as `postgres`, whose default
-- privileges for NEW tables only grant anon/authenticated/service_role
-- TRUNCATE/REFERENCES/TRIGGER — never SELECT/INSERT/UPDATE/DELETE (that
-- richer default only applies to tables created by `supabase_admin`, e.g.
-- via Studio's SQL editor, not this runner). RLS restricts which ROWS a
-- role sees; the role still needs the base table GRANT to attempt anything
-- at all — data-model-security.md's "deny by default" was correctly encoded
-- in the RLS policies, but was missing this second, lower layer.
--
-- Grants mirror data-model-security.md §4 exactly:
--   - anon gets NOTHING on any of these five tables — no exceptions.
--   - authenticated gets what RLS then further restricts by role (staff's
--     own-row / admin, events/attendees select-or-full, audit_log
--     select+insert only, never update/delete for anyone).
--   - event_access_tokens gets NO table grant for anon or authenticated at
--     all (on top of already having zero RLS policies) — defense in depth
--     on the one table where token_hash/short_code_hash must never be
--     reachable by any client role (§5.6).
--   - service_role gets what its two actual call sites need (§6): full on
--     events/attendees/event_access_tokens (token verification + scoped
--     Management writes), nothing extra assumed for staff/audit_log since
--     those are only ever touched via a user's own authenticated session.

-- migrate:up

grant select, insert, update, delete on staff to authenticated;

grant select, insert, update, delete on events to authenticated;
grant select, insert, update, delete on events to service_role;

grant select, insert, update, delete on event_access_tokens to service_role;
-- deliberately no grant to anon or authenticated on event_access_tokens

grant select, insert, update, delete on attendees to authenticated;
grant select, insert, update, delete on attendees to service_role;

grant select, insert on audit_log to authenticated;
-- deliberately no update/delete grant to anyone, including service_role —
-- append-only enforced at the grant layer too, not just by policy omission.

-- migrate:down
revoke select, insert on audit_log from authenticated;
revoke select, insert, update, delete on attendees from service_role;
revoke select, insert, update, delete on attendees from authenticated;
revoke select, insert, update, delete on event_access_tokens from service_role;
revoke select, insert, update, delete on events from service_role;
revoke select, insert, update, delete on events from authenticated;
revoke select, insert, update, delete on staff from authenticated;
