-- 007 WHT gross-up mode + receipt numbers (DOWN)

ALTER TABLE payment_transactions DROP COLUMN IF EXISTS wht_mode;

CREATE OR REPLACE FUNCTION next_receipt_number(p_tenant text, p_year integer, p_prefix text)
RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  INSERT INTO receipt_counters (tenant_id, be_year, last_number)
  VALUES (p_tenant, p_year, 0)
  ON CONFLICT (tenant_id, be_year) DO NOTHING;
  SELECT last_number INTO v_last FROM receipt_counters
  WHERE tenant_id = p_tenant AND be_year = p_year FOR UPDATE;
  UPDATE receipt_counters SET last_number = v_last + 1
  WHERE tenant_id = p_tenant AND be_year = p_year;
  RETURN p_prefix || lpad((v_last + 1)::text, 4, '0');
END; $$ LANGUAGE plpgsql;
