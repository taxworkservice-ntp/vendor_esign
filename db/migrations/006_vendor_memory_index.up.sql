-- 006 vendor memory index (UP) — supports the vendor recall query:
--   select ... from payment_transactions
--   where tenant_id=$1 and vendor_id=$2 and status not in ('draft','void','cancelled')
--   order by created_at desc
-- Partial index matches the filter so recall stays index-ordered as history grows.

CREATE INDEX IF NOT EXISTS idx_pt_vendor_recent
  ON payment_transactions (tenant_id, vendor_id, created_at DESC)
  WHERE status NOT IN ('draft','void','cancelled');
