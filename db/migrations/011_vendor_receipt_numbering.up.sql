-- 011 per-vendor receipt numbering (UP)
-- The receipt is the vendor's own document: RCT-{VENDORNO}-{BE_YEAR}-{SEQ}.
-- vendor_payees.vendor_no is a per-tenant running vendor number (1, 2, …).
-- doc_number_sequences is now keyed per (user, doc_type, be_year, vendor_no).

ALTER TABLE vendor_payees
  ADD COLUMN IF NOT EXISTS vendor_no integer NOT NULL DEFAULT 0;

-- Backfill existing vendors with a stable per-tenant sequence.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM vendor_payees
)
UPDATE vendor_payees v SET vendor_no = n.rn
FROM numbered n WHERE v.id = n.id AND v.vendor_no = 0;

ALTER TABLE doc_number_sequences
  ADD COLUMN IF NOT EXISTS vendor_no integer;

DROP INDEX IF EXISTS idx_dns_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dns_scope
  ON doc_number_sequences (user_id, doc_type, be_year, vendor_no);

-- Vendor-aware numbering. The vendor_no = 0 row (if present) acts as the base
-- sequence, so every vendor's first receipt inherits the configured start.
CREATE OR REPLACE FUNCTION generate_doc_number(
  p_user_id text, p_doc_type text, p_year integer, p_vendor_no integer
) RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, vendor_no, last_number)
  VALUES (
    p_user_id, p_doc_type, p_year, p_vendor_no,
    COALESCE((SELECT last_number FROM doc_number_sequences
      WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = 0), 0)
  )
  ON CONFLICT (user_id, doc_type, be_year, vendor_no) DO NOTHING;
  SELECT last_number INTO v_last FROM doc_number_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = p_vendor_no
  FOR UPDATE;
  UPDATE doc_number_sequences SET last_number = v_last + 1
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = p_vendor_no;
  RETURN 'RCT-' || lpad(p_vendor_no::text, 3, '0') || '-' || p_year || '-' || lpad((v_last + 1)::text, 3, '0');
END; $$ LANGUAGE plpgsql;
