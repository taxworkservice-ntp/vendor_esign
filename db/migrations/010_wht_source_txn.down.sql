-- 010 link auto-generated WHT certificates to their source receipt (DOWN)

DROP INDEX IF EXISTS wht_records_source_txn_idx;
ALTER TABLE wht_records DROP COLUMN IF EXISTS source_transaction_id;
