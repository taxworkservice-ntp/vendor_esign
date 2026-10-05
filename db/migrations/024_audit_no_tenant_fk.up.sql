-- Audit is cross-tenant. The operator console records platform-level events
-- (operator login, settings changes, impersonation start/stop) with
-- user_id = 'PLATFORM', which the 008 foreign key to client_profiles rejected.
-- audit_events is append-only and its reads are already gated by the admin
-- operation, so the tenant FK is the wrong constraint here.
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_tenant_id_fkey;
