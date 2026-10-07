-- Collapse any voided/superseded certificates back to 'active' before restoring
-- the narrower domain, then drop the timestamp column.
ALTER TABLE wht_records DROP CONSTRAINT IF EXISTS wht_records_status_check;
UPDATE wht_records SET status = 'active' WHERE status IN ('void', 'superseded');
ALTER TABLE wht_records
  ADD CONSTRAINT wht_records_status_check
  CHECK (status IN ('active', 'done'));
ALTER TABLE wht_records DROP COLUMN IF EXISTS voided_at;
