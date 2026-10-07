-- WHT certificates are auto-created when an issued receipt carries withholding.
-- Voiding that receipt must be able to void the certificate too (or mark it
-- superseded when it was already filed), so the register stops counting a
-- document that no longer exists. Extend the status domain and record when.
ALTER TABLE wht_records DROP CONSTRAINT IF EXISTS wht_records_status_check;
ALTER TABLE wht_records
  ADD CONSTRAINT wht_records_status_check
  CHECK (status IN ('active', 'done', 'void', 'superseded'));
ALTER TABLE wht_records ADD COLUMN IF NOT EXISTS voided_at timestamptz;
