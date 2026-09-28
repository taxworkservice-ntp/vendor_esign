-- 003 tax-id gate (DOWN)
ALTER TABLE authorizations DROP COLUMN IF EXISTS corrections;
ALTER TABLE vendor_requests DROP COLUMN IF EXISTS unlocked_at;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS tax_id_last4;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS tax_id_hash;
