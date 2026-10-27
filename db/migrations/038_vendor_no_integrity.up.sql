-- 038 vendor numbers are unique, allocated, and required (UP)
--
-- `RCT-{vendor_no}-{BE_YEAR}-{SEQ}` is only trustworthy if vendor_no identifies
-- exactly one payee per workspace. Two payees sharing a number share one receipt
-- book, so their documents interleave in a series that is supposed to belong to
-- one vendor. 011 assumed uniqueness but never enforced it, and both create
-- paths computed `max(vendor_no) + 1` inline — a race that hands the same number
-- to two concurrent creates.
--
-- The live consequence today: six payees sit at vendor_no = 0 (raw inserts that
-- omitted the column), and two issued receipts carry `RCT-000-2569-006/007` —
-- a vendor segment of 000, which is not a vendor. The 000 row is also the
-- tenant-wide seed, so those issuances burned the base counter.
--
-- This migration:
--   1. numbers the unnumbered payees (continuing from each workspace's max),
--   2. adds generate_vendor_no() — the same row-locked counter pattern as
--      generate_doc_number(), self-seeding above both the counter and the
--      highest existing number so a manual insert cannot cause a collision,
--   3. forbids the failure modes: vendor_no is required, positive, and unique
--      per workspace.
--
-- Issued numbers are not rewritten: `RCT-000-…` stays on file as a historical
-- defect (void it if the document must be withdrawn). Only future issuances are
-- affected, and they cannot mint 000 again (see also 037's guard).

-- 1) Number every payee that has no vendor number yet.
WITH unnumbered AS (
  SELECT
    v.id,
    COALESCE((
      SELECT max(m.vendor_no) FROM vendor_payees m
      WHERE m.user_id = v.user_id AND m.vendor_no > 0
    ), 0) + row_number() OVER (PARTITION BY v.user_id ORDER BY v.created_at, v.id) AS new_no
  FROM vendor_payees v
  WHERE v.vendor_no = 0
)
UPDATE vendor_payees v SET vendor_no = u.new_no
FROM unnumbered u
WHERE v.id = u.id;

-- 2) Atomic allocator. One counter row per workspace under doc_type
--    'vendor_payee' (be_year 0 = not year-scoped). The UPDATE takes the row
--    lock, so concurrent creates serialize instead of racing on max().
CREATE OR REPLACE FUNCTION generate_vendor_no(p_user_id text) RETURNS integer AS $$
DECLARE v_next integer;
BEGIN
  INSERT INTO doc_number_sequences (user_id, doc_type, be_year, vendor_no, last_number)
  VALUES (
    p_user_id, 'vendor_payee', 0, 0,
    COALESCE((SELECT max(vendor_no) FROM vendor_payees
      WHERE user_id = p_user_id AND vendor_no > 0), 0)
  )
  ON CONFLICT (user_id, doc_type, be_year, vendor_no) DO NOTHING;
  UPDATE doc_number_sequences
  SET last_number = GREATEST(
    last_number + 1,
    COALESCE((SELECT max(vendor_no) FROM vendor_payees
      WHERE user_id = p_user_id AND vendor_no > 0), 0) + 1
  )
  WHERE user_id = p_user_id AND doc_type = 'vendor_payee' AND be_year = 0 AND vendor_no = 0
  RETURNING last_number INTO v_next;
  RETURN v_next;
END; $$ LANGUAGE plpgsql;

-- 3) Enforce it. The default is dropped so an insert that forgets vendor_no
--    fails loudly instead of silently creating an unnumbered (000) payee.
ALTER TABLE vendor_payees ALTER COLUMN vendor_no DROP DEFAULT;

ALTER TABLE vendor_payees DROP CONSTRAINT IF EXISTS vendor_payees_vendor_no_positive;
ALTER TABLE vendor_payees ADD CONSTRAINT vendor_payees_vendor_no_positive CHECK (vendor_no > 0);

DROP INDEX IF EXISTS uq_vendor_payees_vendor_no;
CREATE UNIQUE INDEX uq_vendor_payees_vendor_no ON vendor_payees (user_id, vendor_no);
