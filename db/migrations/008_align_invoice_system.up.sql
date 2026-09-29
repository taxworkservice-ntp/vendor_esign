-- 008 Align to invoice-system conventions (UP)
-- Renames vendor_esign tables/columns to the host's shape so the future Supabase
-- move is a copy + RLS-helper swap, not a rewrite. Applying on Neon (text ids);
-- types move to uuid at the Supabase migration. `config` stays as a Neon-only
-- settings shim until P2 folds it into client_profiles/doc_number_sequences.

-- ── 1. Table renames (host names) ──
ALTER TABLE tenants            RENAME TO client_profiles;
ALTER TABLE app_users          RENAME TO profiles;
ALTER TABLE user_tenants       RENAME TO client_members;
ALTER TABLE vendors            RENAME TO vendor_payees;
ALTER TABLE payment_transactions RENAME TO vendor_payables;
ALTER TABLE receipts           RENAME TO vendor_receipts;
ALTER TABLE receipt_counters   RENAME TO doc_number_sequences;
ALTER TABLE authorizations     RENAME TO vendor_authorizations;

-- ── 2. Workspace key: tenant_id → user_id on tenant-scoped tables ──
ALTER TABLE vendor_payables        RENAME COLUMN tenant_id TO user_id;
ALTER TABLE vendor_payees          RENAME COLUMN tenant_id TO user_id;
ALTER TABLE vendor_receipts        RENAME COLUMN tenant_id TO user_id;
ALTER TABLE vendor_authorizations  RENAME COLUMN tenant_id TO user_id;
ALTER TABLE vendor_requests        RENAME COLUMN tenant_id TO user_id;
ALTER TABLE audit_events           RENAME COLUMN tenant_id TO user_id;
ALTER TABLE config                 RENAME COLUMN tenant_id TO user_id;
ALTER TABLE doc_number_sequences   RENAME COLUMN tenant_id TO user_id;

-- client_members: workspace vs member keys (host convention)
ALTER TABLE client_members RENAME COLUMN user_id TO member_user_id;
ALTER TABLE client_members RENAME COLUMN tenant_id TO workspace_user_id;

-- ── 3. Identity split: credentials out of profiles ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  must_change_pw boolean NOT NULL DEFAULT true,
  temp_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
SELECT id, password_hash, must_change_pw, temp_expires_at FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. client_members: staff roles + permissions + force-change flag ──
ALTER TABLE client_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS client_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id text NOT NULL,
  actor_user_id uuid,
  target_member_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Documents model: host-shaped vendor receipts + line items ──
-- (doc_type reserved for the future Supabase merge into `documents`.)
ALTER TABLE vendor_receipts
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'vendor_receipt',
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_key text;

CREATE TABLE IF NOT EXISTS document_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES vendor_receipts(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'รายการ',
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0, -- extension over host (host has no discount)
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 6. WHT module (column-exact host shape — mirrors sql/add_wht_*.sql) ──
CREATE TABLE IF NOT EXISTS wht_vendors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  name         text NOT NULL,
  tax_id       text,
  address      text,
  contact_name text,
  phone        text,
  email        text,
  note         text,
  vendor_type  text NOT NULL DEFAULT 'company' CHECK (vendor_type IN ('company','individual')),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wht_records (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL,
  vendor_id                uuid NOT NULL REFERENCES wht_vendors(id) ON DELETE RESTRICT,
  form_type                text NOT NULL DEFAULT 'pnd3'
                           CHECK (form_type IN ('pnd1','pnd1_special','pnd2','pnd3','pnd2a','pnd3a','pnd53')),
  issue_date               date NOT NULL DEFAULT CURRENT_DATE,
  amount                   numeric(15,2) NOT NULL DEFAULT 0,
  wht_rate                 numeric(5,2) NOT NULL DEFAULT 0,
  wht_amount               numeric(15,2) NOT NULL DEFAULT 0,
  certificate_no           text,
  certificate_generated_at timestamptz,
  description              text,
  note                     text,
  status                   text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wht_records_cert_no
  ON wht_records (user_id, certificate_no) WHERE certificate_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wht_records_user_vendor ON wht_records (user_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_wht_records_issue_date ON wht_records (user_id, issue_date);

-- Certificate number: YYMM + 3-digit sequence per workspace/month (host parity).
CREATE OR REPLACE FUNCTION generate_wht_certificate_no(
  p_user_id text, p_issue_date date, p_skip_id uuid DEFAULT NULL
) RETURNS text AS $$
DECLARE v_yymm text; v_seq int;
BEGIN
  v_yymm := to_char(p_issue_date, 'YYMM');
  SELECT coalesce(max(nullif(right(certificate_no, 3), '')::int), 0) + 1
  INTO v_seq
  FROM wht_records
  WHERE user_id = p_user_id AND certificate_no IS NOT NULL
    AND to_char(issue_date, 'YYMM') = v_yymm
    AND (p_skip_id IS NULL OR id != p_skip_id);
  RETURN v_yymm || lpad(v_seq::text, 3, '0');
END; $$ LANGUAGE plpgsql;

-- ── 5c. Payables: ensure host-side fields exist (idempotent) ──
ALTER TABLE vendor_payables
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS tax_id_hash text,
  ADD COLUMN IF NOT EXISTS tax_id_last4 text;

-- ── 5b. Vendor request link: store the capability token so the client can
-- re-copy the signing link later (hash stays for lookup verification). ──
ALTER TABLE vendor_requests ADD COLUMN IF NOT EXISTS token text;

-- ── 6b. Item catalog (host-shaped) ──
CREATE TABLE IF NOT EXISTS items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  name        text NOT NULL,
  unit        text NOT NULL DEFAULT 'รายการ',
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_user ON items (user_id);

-- ── 7. RLS helper: app_user_id() (→ auth.uid() on Supabase) ──
-- withTenant() sets app.user_id/app.role; the helper keeps policies identical to
-- the host's `user_id = auth.uid()` shape.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$ LANGUAGE sql STABLE;

-- ── 8. Numbering: generate_doc_number(user_id, doc_type, year, prefix) ──
ALTER TABLE doc_number_sequences
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'vendor_receipt',
  ADD COLUMN IF NOT EXISTS prefix text,
  ADD COLUMN IF NOT EXISTS reset_yearly boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dns_scope
  ON doc_number_sequences (user_id, doc_type, be_year);

CREATE OR REPLACE FUNCTION generate_doc_number(
  p_user_id text, p_doc_type text, p_year integer, p_prefix text
) RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, last_number, prefix)
  VALUES (p_user_id, p_doc_type, p_year, 0, p_prefix)
  ON CONFLICT (user_id, doc_type, be_year) DO NOTHING;
  SELECT last_number INTO v_last FROM doc_number_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year
  FOR UPDATE;
  UPDATE doc_number_sequences SET last_number = v_last + 1
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year;
  RETURN p_prefix || '-' || p_year || '-' || lpad((v_last + 1)::text, 3, '0');
END; $$ LANGUAGE plpgsql;

-- ── 9. Recreate RLS policies against the new tables + app_user_id() ──
DROP POLICY IF EXISTS p_tenants ON client_profiles;
CREATE POLICY p_client_profiles ON client_profiles FOR ALL USING (
  id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vendors ON vendor_payees;
CREATE POLICY p_vendor_payees ON vendor_payees FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_pt ON vendor_payables;
CREATE POLICY p_vendor_payables ON vendor_payables FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_vr ON vendor_requests;
CREATE POLICY p_vendor_requests ON vendor_requests FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_auth ON vendor_authorizations;
CREATE POLICY p_vendor_authorizations ON vendor_authorizations FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_receipts ON vendor_receipts;
CREATE POLICY p_vendor_receipts ON vendor_receipts FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_counters ON doc_number_sequences;
CREATE POLICY p_doc_number_sequences ON doc_number_sequences FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_audit ON audit_events;
CREATE POLICY p_audit_events ON audit_events FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
DROP POLICY IF EXISTS p_config ON config;
CREATE POLICY p_config ON config FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());

ALTER TABLE document_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_doc_lines ON document_line_items;
CREATE POLICY p_doc_lines ON document_line_items FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());

ALTER TABLE wht_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_wht_records ON wht_records;
CREATE POLICY p_wht_records ON wht_records FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());

ALTER TABLE wht_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_wht_vendors ON wht_vendors;
CREATE POLICY p_wht_vendors ON wht_vendors FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_items ON items;
CREATE POLICY p_items ON items FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());
