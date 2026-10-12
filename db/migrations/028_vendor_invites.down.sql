-- 028 vendor self-onboarding invites (DOWN)
DROP TABLE IF EXISTS vendor_invites;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS bank_name;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS bank_account_encrypted;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS account_holder;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS id_doc_path;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS bank_doc_path;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS id_number_hash;
