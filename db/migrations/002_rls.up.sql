-- 002 RLS (UP) — Neon Postgres app-level isolation.
-- The browser NEVER connects directly. Server (Netlify Function / migrate script)
-- sets `SET LOCAL app.tenant_id` + `app.role` per request using service credentials.
-- Client role: own tenant only. Bookkeeper: all tenants.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Helper: current tenant / role from session settings (empty = deny)
CREATE OR REPLACE FUNCTION app_tenant() RETURNS text AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION app_is_bookkeeper() RETURNS boolean AS $$
  SELECT current_setting('app.role', true) = 'bookkeeper'
$$ LANGUAGE sql STABLE;

-- Tenants: own row, or any for bookkeeper
DROP POLICY IF EXISTS p_tenants ON tenants;
CREATE POLICY p_tenants ON tenants FOR ALL USING (id = app_tenant() OR app_is_bookkeeper());

-- Generic tenant-scoped tables
DROP POLICY IF EXISTS p_vendors ON vendors;
CREATE POLICY p_vendors ON vendors FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_pt ON payment_transactions;
CREATE POLICY p_pt ON payment_transactions FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_vr ON vendor_requests;
CREATE POLICY p_vr ON vendor_requests FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_auth ON authorizations;
CREATE POLICY p_auth ON authorizations FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_receipts ON receipts;
CREATE POLICY p_receipts ON receipts FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_counters ON receipt_counters;
CREATE POLICY p_counters ON receipt_counters FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_audit ON audit_events;
CREATE POLICY p_audit ON audit_events FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());

DROP POLICY IF EXISTS p_config ON config;
CREATE POLICY p_config ON config FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper());
