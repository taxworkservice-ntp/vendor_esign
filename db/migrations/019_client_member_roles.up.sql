-- Relax client_members.role to the app's role model.
--
-- 004 created user_tenants_role_check allowing only the pre-008 role names
-- (client_user/client_admin/bookkeeper/super_admin). The admin operation and
-- the client portal since use owner/manager/officer (see docs/TEST_USERS.md),
-- so every insert of those roles was rejected. Keep the legacy values so older
-- rows remain valid; add the current ones.
ALTER TABLE client_members DROP CONSTRAINT IF EXISTS user_tenants_role_check;
ALTER TABLE client_members ADD CONSTRAINT client_members_role_check
  CHECK (role = ANY (ARRAY[
    'owner', 'manager', 'officer',
    'client_user', 'client_admin', 'bookkeeper', 'super_admin'
  ]));
