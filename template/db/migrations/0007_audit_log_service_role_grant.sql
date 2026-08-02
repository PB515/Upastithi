-- 0007_audit_log_service_role_grant — grant service_role INSERT on audit_log.
--
-- 0005 assumed audit_log would only ever be written via an admin's own
-- authenticated session ("those are only ever touched via a user's own
-- authenticated session") — wrong in practice. Every audit-logged action
-- built since (generateGrant/revokeGrant/extendGrant in Slice 2,
-- addViewer/removeViewer in Slice 4) already holds a service-role client
-- for its main write — event_access_tokens has zero client policies,
-- creating/deleting an auth.users row is a GoTrue admin-API operation
-- regardless of RLS — and reused that same client for the audit call too.
-- Every audit_log insert from those five call sites has been silently
-- failing since Slice 2: writeAuditLog() logs the error and swallows it by
-- design ("auditing must never break the main action"), so nothing
-- surfaced until the server logs were actually read during Slice 4's
-- browser verification, not from re-reading the doc.

-- migrate:up
grant insert on audit_log to service_role;

-- migrate:down
revoke insert on audit_log from service_role;
