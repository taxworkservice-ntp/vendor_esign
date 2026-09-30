-- 011 per-vendor receipt numbering (DOWN)

DROP FUNCTION IF EXISTS generate_doc_number(text, text, integer, integer);

-- Restore the tenant/year-scoped function from 008.
CREATE OR REPLACE FUNCTION generate_doc_number(
  p_user_id text, p_doc_type text, p_year integer, p_prefix text
) RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, last_number, prefix)
  VALUES (p_user_id, p_doc_type, p_year, 0, p_prefix)
  ON CONFLICT (user_id, doc_type, be_year) DO NOTHING;
  SELECT last_number INTO v_last FROM doc_number_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year
  FOR UPDATE;
  UPDATE doc_number_sequences SET last_number = v_last + 1
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year;
  RETURN p_prefix || '-' || p_year || '-' || lpad((v_last + 1)::text, 3, '0');
END; $$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS idx_dns_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dns_scope
  ON doc_number_sequences (user_id, doc_type, be_year);

ALTER TABLE doc_number_sequences DROP COLUMN IF EXISTS vendor_no;
ALTER TABLE vendor_payees DROP COLUMN IF EXISTS vendor_no;
