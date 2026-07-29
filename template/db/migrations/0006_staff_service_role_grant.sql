-- 0006_staff_service_role_grant — grant service_role access to `staff`.
--
-- 0005 deliberately left this out, reasoning "staff is only ever touched via
-- a user's own authenticated session" — but that's wrong, and contradicted
-- data-model-security.md §2 in the same breath: bootstrapping the first
-- Admin/Viewer is explicitly "insert directly via ... the service-role
-- client after the person signs up," because there is no authenticated
-- admin session yet at that point (that's the whole reason it's a manual,
-- out-of-band step — see tooling/dev-seed.ts). Caught by actually running
-- the bootstrap script, not by re-reading the doc carefully enough the
-- first time.

-- migrate:up
grant select, insert, update, delete on staff to service_role;

-- migrate:down
revoke select, insert, update, delete on staff from service_role;
