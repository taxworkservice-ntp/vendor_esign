-- 036 slip original filename (UP)
-- A payment slip now stores its FILE (bytes) under `slips/`, referenced by
-- `slip_file_path`. The original filename the user uploaded is kept separately
-- in `slip_file_name` so the UI can show a friendly name without leaking the
-- storage path. Legacy rows used `slip_file_path` to hold a bare filename (the
-- file itself was never stored) — clear those so the viewer does not try to
-- read a non-existent object.
ALTER TABLE vendor_payables ADD COLUMN IF NOT EXISTS slip_file_name text;

UPDATE vendor_payables
  SET slip_file_path = NULL
  WHERE slip_file_path IS NOT NULL AND slip_file_path NOT LIKE '%/slips/%';
