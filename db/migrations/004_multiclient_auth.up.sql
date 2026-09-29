-- 004 multi-client + admin-provisioned auth (UP) — reversible via 004 down.
-- Extends tenants with client profile fields; adds app_users, user_tenants, sessions.
-- Passwords: scrypt hash in Node only (server/src/auth.ts). DB stores hash text, never plaintext.

-- Tenants: client profile for receipt series + buyer block + admin list.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended')),
  ADD COLUMN IF NOT EXISTS be_year integer NOT NULL DEFAULT 2569,
  ADD COLUMN IF NOT EXISTS start_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill pilot tenant ABC + any existing rows.
UPDATE tenants SET
  client_code = COALESCE(NULLIF(client_code, ''), id),
  display_name = COALESCE(NULLIF(display_name, ''), name),
  be_year = COALESCE(be_year, 2569)
WHERE client_code IS NULL OR display_name IS NULL;

-- Unique client_code for receipt prefix (ABC-R-2569-NNNN).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_client_code_key') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_client_code_key UNIQUE (client_code);
  END IF;
END $$;

-- Admin-provisioned users. No self-signup: super_admin / client_admin create rows
-- via POST /api/admin/* with a temp password (hashed in Node, shown once).
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  password_hash text NOT NULL,
  must_change_pw boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  temp_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Uniqueness on lower(email) — no citext dependency (portable across hosts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users (lower(email));

DROP TRIGGER IF EXISTS trg_app_users_updated ON app_users;
CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Membership: which tenant(s) a user can access, with which role.
-- client users: exactly 1 row. bookkeeper / super_admin: N rows or none (global).
CREATE TABLE IF NOT EXISTS user_tenants (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('client_user','client_admin','bookkeeper','super_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

-- Opaque sessions: cookie holds random token, DB holds sha256 hash only.
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Verification codes must be globally unique once multi-tenant verify is tenant-agnostic.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_verification_code_key') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_verification_code_key UNIQUE (verification_code);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- RLS helpers: super_admin bypass + current user id for audit actor.
CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean AS $$
  SELECT current_setting('app.role', true) IN ('super_admin')
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$ LANGUAGE sql STABLE;

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Super-admin sees everything; others see only own rows. Service role (migrations,
-- login exchange) bypasses RLS as table owner — these policies gate app-level roles.
DROP POLICY IF EXISTS p_app_users ON app_users;
CREATE POLICY p_app_users ON app_users FOR ALL USING (
  app_is_super_admin() OR app_is_bookkeeper() OR id::text = app_user_id()
);
DROP POLICY IF EXISTS p_user_tenants ON user_tenants;
CREATE POLICY p_user_tenants ON user_tenants FOR ALL USING (
  app_is_super_admin() OR app_is_bookkeeper() OR user_id::text = app_user_id()
);
DROP POLICY IF EXISTS p_sessions ON sessions;
CREATE POLICY p_sessions ON sessions FOR ALL USING (
  app_is_super_admin() OR user_id::text = app_user_id()
);

-- Extend existing tenant-scoped policies with super_admin bypass.
DROP POLICY IF EXISTS p_tenants ON tenants;
CREATE POLICY p_tenants ON tenants FOR ALL USING (
  id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_vendors ON vendors;
CREATE POLICY p_vendors ON vendors FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_pt ON payment_transactions;
CREATE POLICY p_pt ON payment_transactions FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_vr ON vendor_requests;
CREATE POLICY p_vr ON vendor_requests FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_auth ON authorizations;
CREATE POLICY p_auth ON authorizations FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_receipts ON receipts;
CREATE POLICY p_receipts ON receipts FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_counters ON receipt_counters;
CREATE POLICY p_counters ON receipt_counters FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_audit ON audit_events;
CREATE POLICY p_audit ON audit_events FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
DROP POLICY IF EXISTS p_config ON config;
CREATE POLICY p_config ON config FOR ALL USING (
  tenant_id = app_tenant() OR app_is_bookkeeper() OR app_is_super_admin()
);
