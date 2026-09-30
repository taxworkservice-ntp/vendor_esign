-- 010 link auto-generated WHT certificates to their source receipt (UP)
-- When a receipt is issued, a withholding certificate is generated for it.
-- The column makes generation idempotent (one certificate per transaction).

ALTER TABLE wht_records
  ADD COLUMN IF NOT EXISTS source_transaction_id uuid;

CREATE INDEX IF NOT EXISTS wht_records_source_txn_idx
  ON wht_records (user_id, source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;
