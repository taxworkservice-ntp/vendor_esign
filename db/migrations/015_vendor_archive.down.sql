-- 015 vendor archive + list indexes (DOWN)
-- Note: the items uniqueness index is dropped only if it exists. If migration 015
-- skipped creating it because the catalogue already held duplicate names, the
-- duplicates must be resolved before this will apply cleanly.

DROP INDEX CONCURRENTLY IF EXISTS idx_vendor_payees_user_name;
DROP INDEX CONCURRENTLY IF EXISTS idx_vendor_payees_user;
DROP INDEX IF EXISTS uq_items_user_name;

ALTER TABLE vendor_payees DROP COLUMN IF EXISTS is_active;
