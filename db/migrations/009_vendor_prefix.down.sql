-- 009 vendor name prefix (DOWN)

ALTER TABLE vendor_authorizations DROP COLUMN IF EXISTS vendor_prefix;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS prefix;
