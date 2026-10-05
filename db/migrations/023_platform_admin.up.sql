-- 023 platform (provider) admin + global settings.
--
-- The operator console needs an identity that is NOT tied to any client
-- workspace: a provider admin controls the whole app, not one tenant. The old
-- model inferred "super admin" from a client_members.role = 'super_admin',
-- which required a workspace row (client_members.workspace_user_id is NOT NULL
-- and FK-bound) — so a true provider had nowhere to live. Make it a property of
-- the account instead.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- Global (cross-tenant) settings the operator controls: announcement banner,
-- maintenance mode, feature flags. Per-tenant settings stay in `config`.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
