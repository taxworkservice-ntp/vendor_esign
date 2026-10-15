-- Revert the WHT certificate number to the pre-034 shape (no 'WT' prefix).
CREATE OR REPLACE FUNCTION generate_wht_certificate_no(
  p_user_id text, p_issue_date date, p_skip_id uuid DEFAULT NULL
) RETURNS text AS $$
DECLARE v_yymm text; v_seq int;
BEGIN
  v_yymm := to_char(p_issue_date, 'YYMM');
  SELECT coalesce(max(nullif(right(certificate_no, 3), '')::int), 0) + 1
  INTO v_seq
  FROM wht_records
  WHERE user_id = p_user_id AND certificate_no IS NOT NULL
    AND to_char(issue_date, 'YYMM') = v_yymm
    AND (p_skip_id IS NULL OR id != p_skip_id);
  RETURN v_yymm || '1' || lpad(v_seq::text, 3, '0');
END; $$ LANGUAGE plpgsql;
