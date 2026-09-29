-- 008 Align to invoice-system conventions (DOWN)
-- Reverses 008 up. Best-effort: drops the additive tables/columns and renames back.

DROP POLICY IF EXISTS p_wht_vendors ON wht_vendors;
DROP POLICY IF EXISTS p_wht_records ON wht_records;
DROP FUNCTION IF EXISTS generate_wht_certificate_no(text, date, uuid);
DROP TABLE IF EXISTS wht_records;
DROP TABLE IF EXISTS wht_vendors;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS document_line_items;

DROP FUNCTION IF EXISTS generate_doc_number(text, text, integer, text);

ALTER TABLE doc_number_sequences
  DROP COLUMN IF EXISTS reset_yearly,
  DROP COLUMN IF EXISTS prefix,
  DROP COLUMN IF EXISTS doc_type;

ALTER TABLE vendor_receipts
  DROP COLUMN IF EXISTS pdf_key,
  DROP COLUMN IF EXISTS net_payable,
  DROP COLUMN IF EXISTS wht_amount,
  DROP COLUMN IF EXISTS vat_amount,
  DROP COLUMN IF EXISTS subtotal,
  DROP COLUMN IF EXISTS doc_number,
  DROP COLUMN IF EXISTS doc_type;

DROP TABLE IF EXISTS client_permission_audit;

ALTER TABLE client_members
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS password_changed,
  DROP COLUMN IF EXISTS status;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS role;

-- restore single-table credentials (before dropping the split table)
UPDATE profiles p SET password_hash = c.password_hash,
  must_change_pw = c.must_change_pw, temp_expires_at = c.temp_expires_at
FROM auth_credentials c WHERE c.user_id = p.id;
DROP TABLE IF EXISTS auth_credentials;

-- column renames back
ALTER TABLE client_members RENAME COLUMN workspace_user_id TO tenant_id;
ALTER TABLE client_members RENAME COLUMN member_user_id TO user_id;

ALTER TABLE config               RENAME COLUMN user_id TO tenant_id;
ALTER TABLE audit_events         RENAME COLUMN user_id TO tenant_id;
ALTER TABLE vendor_requests      RENAME COLUMN user_id TO tenant_id;
ALTER TABLE vendor_authorizations RENAME COLUMN user_id TO tenant_id;
ALTER TABLE vendor_receipts      RENAME COLUMN user_id TO tenant_id;
ALTER TABLE vendor_payees        RENAME COLUMN user_id TO tenant_id;
ALTER TABLE vendor_payables      RENAME COLUMN user_id TO tenant_id;

-- table renames back
ALTER TABLE vendor_authorizations RENAME TO authorizations;
ALTER TABLE doc_number_sequences  RENAME TO receipt_counters;
ALTER TABLE vendor_receipts       RENAME TO receipts;
ALTER TABLE vendor_payables       RENAME TO payment_transactions;
ALTER TABLE vendor_payees         RENAME TO vendors;
ALTER TABLE client_members        RENAME TO user_tenants;
ALTER TABLE profiles              RENAME TO app_users;
ALTER TABLE client_profiles       RENAME TO tenants;

DROP FUNCTION IF EXISTS app_user_id();

-- restore pilot-era policies (see 004)
DROP POLICY IF EXISTS p_client_profiles ON tenants;
CREATE POLICY p_tenants ON tenants FOR ALL USING (id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendor_payees ON vendors;
CREATE POLICY p_vendors ON vendors FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendor_payables ON payment_transactions;
CREATE POLICY p_pt ON payment_transactions FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendor_requests ON vendor_requests;
CREATE POLICY p_vr ON vendor_requests FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendor_authorizations ON authorizations;
CREATE POLICY p_auth ON authorizations FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendor_receipts ON receipts;
CREATE POLICY p_receipts ON receipts FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_doc_number_sequences ON receipt_counters;
CREATE POLICY p_counters ON receipt_counters FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_audit_events ON audit_events;
CREATE POLICY p_audit ON audit_events FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_config ON config;
CREATE POLICY p_config ON config FOR ALL USING (tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin());
