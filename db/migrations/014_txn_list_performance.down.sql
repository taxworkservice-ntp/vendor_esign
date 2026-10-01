-- 014 transaction list performance + slip uniqueness (DOWN)
-- Restores the original table constraint and drops the list indexes.
-- Note: restoring UNIQUE (user_id, slip_reference) will fail on a workspace
-- that already holds more than one slip-less transaction — which is precisely
-- the state this migration was written to fix. Collapse the duplicates
-- (attach real slip references) before rolling back.

DROP INDEX CONCURRENTLY IF EXISTS idx_vp_user_net;
DROP INDEX CONCURRENTLY IF EXISTS idx_vp_user_status_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_vp_user_date;
DROP INDEX IF EXISTS uq_vp_slip_reference;

ALTER TABLE vendor_payables
  ADD CONSTRAINT payment_transactions_tenant_id_slip_reference_key UNIQUE (user_id, slip_reference);
