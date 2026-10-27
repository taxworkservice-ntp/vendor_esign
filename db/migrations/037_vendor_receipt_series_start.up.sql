-- 037 vendor receipt series opens at the configured start (UP)
--
-- Why: 011 seeded each vendor's book from the `vendor_no = 0` base row:
--
--   COALESCE((SELECT last_number FROM doc_number_sequences
--             WHERE user_id = ... AND doc_type = ... AND be_year = ...
--               AND vendor_no = 0), 0)
--
-- That base row is meant to hold `start_number - 1`, but it also inherited the
-- pre-011 GLOBAL series counter. In the pilot it was left at 3, so the very
-- first receipt ever issued for vendor 001 came out as
-- RCT-001-2569-004 — a gap in the series that no one can explain, because
-- 001–003 were never issued for that vendor at all.
--
-- `client_profiles.start_number` (NOT NULL DEFAULT 1) is the authoritative
-- configured start: it is what the operator console writes at workspace
-- creation and what a workspace reset ("ล้างเริ่มใหม่") restarts from. Seeding
-- from it instead of from the mutable base row:
--
--   * opens every vendor's book at `...-001` (or the configured start),
--   * makes the seed immune to a legacy/polluted base row,
--   * preserves operator intent — a workspace migrating off paper can set
--     start_number = 501 so every vendor book opens at 501.
--
-- Issued numbers are NOT rewritten: renumbering an already-filed receipt is a
-- worse defect than the gap. Existing counters keep counting from where they
-- are; only a fresh (tenant, vendor, year) series opens at the configured
-- start. Everything else about 011/020 is preserved: the insert is idempotent,
-- the counter row is locked with FOR UPDATE, and the number is never MAX()+1.
--
-- Also normalize the base row itself back to `start_number - 1` (it is never
-- incremented — only vendor-specific rows are — so it is a pure seed) so the
-- stored value and the operator console agree.
UPDATE doc_number_sequences d
SET last_number = GREATEST(COALESCE(cp.start_number, 1), 1) - 1
FROM client_profiles cp
WHERE d.user_id = cp.id
  AND d.doc_type = 'vendor_receipt'
  AND d.vendor_no = 0
  AND d.last_number <> GREATEST(COALESCE(cp.start_number, 1), 1) - 1;

-- Vendor-aware numbering. A new vendor's book opens at the workspace's
-- configured start (start_number, default 1 => SEQ 001).
CREATE OR REPLACE FUNCTION generate_doc_number(
  p_user_id text, p_doc_type text, p_year integer, p_vendor_no integer
) RETURNS text AS $$
DECLARE v_last integer;
BEGIN
  -- Never mint a `000` series: the vendor segment must identify a payee.
  IF p_vendor_no IS NULL OR p_vendor_no <= 0 THEN
    RAISE EXCEPTION 'generate_doc_number: vendor_no must be positive (got %)', p_vendor_no;
  END IF;
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, vendor_no, last_number)
  SELECT
    p_user_id, p_doc_type, p_year, p_vendor_no,
    COALESCE((
      SELECT GREATEST(COALESCE(cp.start_number, 1), 1) - 1
      FROM client_profiles cp WHERE cp.id = p_user_id
    ), 0)
  ON CONFLICT (user_id, doc_type, be_year, vendor_no) DO NOTHING;
  SELECT last_number INTO v_last FROM doc_number_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = p_vendor_no
  FOR UPDATE;
  UPDATE doc_number_sequences SET last_number = v_last + 1
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND be_year = p_year AND vendor_no = p_vendor_no;
  RETURN 'RCT-' || lpad(p_vendor_no::text, 3, '0') || '-' || p_year || '-' || lpad((v_last + 1)::text, 3, '0');
END; $$ LANGUAGE plpgsql;
