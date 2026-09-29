-- 005 line items (UP) — a receipt can list multiple items; gross = sum(items).
-- line_items: [{ "description": text, "amount": numeric }]. Empty array = legacy
-- single-line transaction (renderer falls back to description + gross_amount).
-- note: optional free-text header above the item table.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
