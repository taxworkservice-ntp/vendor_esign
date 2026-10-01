-- 013 WHT certificate series digit (UP)
-- Number shape: YYMM + series digit '1' + 3-digit sequence per
-- workspace/month (e.g. 26091003). The client also issues WHT certificates
-- outside this app under a different leading block; the fixed '1' keeps the
-- two sources collision-free (pilot convention, single client).
-- Historical 7-char numbers (YYMMNNN) stay valid and share the same
-- per-month counter, since the sequence reads the last 3 digits either way.

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
