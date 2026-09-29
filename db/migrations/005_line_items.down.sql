-- 005 line items (DOWN) — reverse of 005 up.

ALTER TABLE payment_transactions
  DROP COLUMN IF EXISTS note,
  DROP COLUMN IF EXISTS line_items;
