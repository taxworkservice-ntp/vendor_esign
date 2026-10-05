DROP INDEX IF EXISTS uq_vendor_authorizations_ref;
ALTER TABLE vendor_authorizations
  DROP COLUMN IF EXISTS auth_ref,
  DROP COLUMN IF EXISTS vendor_email,
  DROP COLUMN IF EXISTS vendor_phone;
