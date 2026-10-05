ALTER TABLE client_members DROP CONSTRAINT IF EXISTS client_members_role_check;
ALTER TABLE client_members ADD CONSTRAINT user_tenants_role_check
  CHECK (role = ANY (ARRAY['client_user', 'client_admin', 'bookkeeper', 'super_admin']));
