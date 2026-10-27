-- 038 vendor numbers are unique, allocated, and required (DOWN)
--
-- Restores the pre-038 state: allocator dropped, uniqueness/positivity
-- constraints removed, and the 0 default put back. The backfilled vendor numbers
-- are NOT reverted — un-numbering payees would invalidate the receipt series
-- that already reference them.
DROP INDEX IF EXISTS uq_vendor_payees_vendor_no;

ALTER TABLE vendor_payees DROP CONSTRAINT IF EXISTS vendor_payees_vendor_no_positive;
ALTER TABLE vendor_payees ALTER COLUMN vendor_no SET DEFAULT 0;

DROP FUNCTION IF EXISTS generate_vendor_no(text);
