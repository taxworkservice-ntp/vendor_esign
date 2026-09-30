-- 012 vendor contact fields (DOWN)

ALTER TABLE vendor_payees
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email;
