-- 004 multi-client + admin-provisioned auth (DOWN) — reverses 004 up.
-- Keeps pilot tables + data; drops only what 004 added.

DROP POLICY IF EXISTS p_sessions ON sessions;
DROP POLICY IF EXISTS p_user_tenants ON user_tenants;
DROP POLICY IF EXISTS p_app_users ON app_users;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_tenants;
DROP TABLE IF EXISTS app_users;

ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_verification_code_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_client_code_key;

ALTER TABLE tenants
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS start_number,
  DROP COLUMN IF EXISTS be_year,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS contact_name,
  DROP COLUMN IF EXISTS tax_id,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS client_code;

-- Restore pilot-era tenant policies (no super_admin bypass).
DROP POLICY IF EXISTS p_tenants ON tenants;
CREATE POLICY p_tenants ON tenants FOR ALL USING (id = app_tenant() OR app_is_bookkeeper());
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

DROP FUNCTION IF EXISTS app_user_id();
DROP FUNCTION IF EXISTS app_is_super_admin();
