-- 037 vendor receipt series opens at the configured start (DOWN)
--
-- Restores the 011 body, which seeds a new vendor book from the `vendor_no = 0`
-- base row (the behavior that let a legacy global counter leak into a per-vendor
-- series). The base-row normalization is not reverted: it only rewrote a seed
-- value back to `start_number - 1`, which is what 011 already assumed.
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
