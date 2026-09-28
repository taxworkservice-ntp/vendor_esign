-- 003 tax-id gate (UP) — wrong-recipient guard.
-- payment_transactions carries the EXPECTED id hash (set by client at creation,
-- hash-only, never the full ID). vendor_requests.unlocked_at records a passed
-- gate; sign requires it so the gate cannot be bypassed by direct POST.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS tax_id_hash text,
  ADD COLUMN IF NOT EXISTS tax_id_last4 text;

ALTER TABLE vendor_requests
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

-- Vendor corrections: vendor-edited prefilled info, diffed server-side
-- against the vendor record at signing and reported back to the client.
ALTER TABLE authorizations
  ADD COLUMN IF NOT EXISTS corrections jsonb NOT NULL DEFAULT '[]';
