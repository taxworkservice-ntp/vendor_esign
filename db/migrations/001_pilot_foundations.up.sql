-- 001 pilot foundations (UP) — portable Postgres / Neon.
-- Reversible via 001 down migration. Single-tenant pilot (tenant 'ABC').
-- Conventions: tenant_id everywhere, timestamptz, uuid PKs, append-only audit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Small helper for updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tenants (id, name) VALUES ('ABC', 'Pilot client ABC')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  address text NOT NULL,
  id_number_encrypted text NOT NULL, -- app-level encryption; never plaintext logs
  line_user_id text,
  is_vat_registered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  ref text NOT NULL, -- human ref e.g. TX-1042
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  payment_type text NOT NULL DEFAULT 'ค่าบริการ',
  description text NOT NULL,
  gross_amount numeric(12,2) NOT NULL CHECK (gross_amount > 0),
  wht_rate numeric(5,2) NOT NULL DEFAULT 0,
  wht_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  transfer_date date NOT NULL,
  slip_file_path text,
  slip_reference text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','opened','signed','issued','expired','cancelled','void')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ref),
  UNIQUE (tenant_id, slip_reference)
);
DROP TRIGGER IF EXISTS trg_pt_updated ON payment_transactions;
CREATE TRIGGER trg_pt_updated BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_pt_tenant_status ON payment_transactions (tenant_id, status);

CREATE TABLE IF NOT EXISTS vendor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  token_hash text NOT NULL UNIQUE, -- store hash only, never raw token
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  opened_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vr_txn ON vendor_requests (transaction_id);

CREATE TABLE IF NOT EXISTS authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id),
  vendor_name text NOT NULL, -- snapshot as signed
  vendor_address text NOT NULL,
  vendor_masked_id text NOT NULL,
  signature_image_path text NOT NULL,
  verification_method text NOT NULL DEFAULT 'stub-deferred', -- 'line-liff' when enabled
  line_user_id text,
  ip text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  consent_text_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id),
  number text NOT NULL, -- e.g. ABC-R-2569-0001
  issue_date date NOT NULL,
  pdf_path text,
  pdf_sha256 text,
  verification_code text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  void_reason text,
  voided_at timestamptz,
  replaced_by uuid REFERENCES receipts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

-- Counter: one row per tenant+year. Increment inside the same txn as receipts insert.
CREATE TABLE IF NOT EXISTS receipt_counters (
  tenant_id text NOT NULL REFERENCES tenants(id),
  be_year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, be_year)
);

-- Atomic number issuance. Call inside the finalization txn:
--   SELECT * FROM next_receipt_number('ABC', 2569, 'ABC-R-2569-') -> 'ABC-R-2569-0001'
CREATE OR REPLACE FUNCTION next_receipt_number(p_tenant text, p_year integer, p_prefix text)
RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  INSERT INTO receipt_counters (tenant_id, be_year, last_number)
  VALUES (p_tenant, p_year, 0)
  ON CONFLICT (tenant_id, be_year) DO NOTHING;
  SELECT last_number INTO v_last FROM receipt_counters
  WHERE tenant_id = p_tenant AND be_year = p_year FOR UPDATE;
  UPDATE receipt_counters SET last_number = v_last + 1
  WHERE tenant_id = p_tenant AND be_year = p_year;
  RETURN p_prefix || lpad((v_last + 1)::text, 4, '0');
END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events (tenant_id, entity_type, entity_id);

-- Append-only: block UPDATE and DELETE on audit_events
CREATE OR REPLACE FUNCTION block_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_events;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION block_audit_mutation();

-- Per-tenant config ([CONFIG] — editable, never hard-coded)
CREATE TABLE IF NOT EXISTS config (
  tenant_id text NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
INSERT INTO config (tenant_id, key, value) VALUES
  ('ABC','wht_rates','[{"paymentType":"ค่าจ้างทำของ","rate":3,"label":"ค่าจ้างทำของ"},{"paymentType":"ค่าวิชาชีพอิสระ","rate":3,"label":"ค่าวิชาชีพอิสระ"},{"paymentType":"ค่าบริการ","rate":3,"label":"ค่าบริการ"},{"paymentType":"ค่าเช่าทรัพย์สิน","rate":5,"label":"ค่าเช่าทรัพย์สิน"},{"paymentType":"ค่านายหน้า","rate":3,"label":"ค่านายหน้า"},{"paymentType":"ค่าขนส่ง","rate":1,"label":"ค่าขนส่ง"},{"paymentType":"ไม่หักภาษี ณ ที่จ่าย","rate":0,"label":"ไม่หักภาษี ณ ที่จ่าย"}]'),
  ('ABC','wht_min_threshold','1000'),
  ('ABC','link_expiry_days','7'),
  ('ABC','consent_text_v1', '{"th": "ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าเฉพาะธุรกรรมนี้เท่านั้น"}')
ON CONFLICT (tenant_id, key) DO NOTHING;
