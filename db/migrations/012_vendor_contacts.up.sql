-- 012 vendor contact fields (UP)
-- Optional contact details; no validation beyond basic length.

ALTER TABLE vendor_payees
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;
