-- Best-effort restore of the 008 overload (not used by current code).
CREATE OR REPLACE FUNCTION generate_doc_number(p_user_id text, p_doc_type text, p_year integer, p_prefix text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE v_last integer;
BEGIN
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, last_number, prefix)
  VALUES (p_user_id, p_doc_type, p_year, 0, p_prefix)
  ON CONFLICT (user_id, doc_type, be_year, vendor_no) DO NOTHING;
  SELECT last_number INTO v_last FROM doc_number_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = 0
  FOR UPDATE;
  UPDATE doc_number_sequences SET last_number = v_last + 1
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = 0;
  RETURN p_prefix || '-' || p_year || '-' || lpad((v_last + 1)::text, 3, '0');
END; $function$;
