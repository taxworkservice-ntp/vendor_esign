-- 009 vendor name prefix (คำนำหน้าชื่อ) (UP)
-- Personal vendors carry a title (นาย/นาง/นางสาว); entity vendors store ''.
-- The prefix is snapshotted on the authorization so an issued receipt is
-- immutable even if the vendor record later changes.

ALTER TABLE vendor_payees
  ADD COLUMN IF NOT EXISTS prefix text NOT NULL DEFAULT '';

ALTER TABLE vendor_authorizations
  ADD COLUMN IF NOT EXISTS vendor_prefix text NOT NULL DEFAULT '';
