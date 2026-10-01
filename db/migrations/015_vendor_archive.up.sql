-- 015 vendor archive + list indexes (UP)
--
-- 1. vendor_payees.is_active. A supplier that has ever been referenced by a
--    transaction can never be deleted (the server returns 409 vendor-in-use, and
--    the mock enforces the same rule), so the register accumulated dead suppliers
--    permanently mixed in with live ones. `is_active` adds an archive state, which
--    `items` has had since 008 but nothing ever read.
--
-- 2. idx_vendor_payees_user. vendor_payees had NO index at all — not even on
--    user_id. Every portal page loaded the whole register with a sequential scan.
--    The money aggregate added to GET /api/client/vendors also groups by
--    (user_id, vendor_id), which this covers alongside the existing
--    idx_pt_vendor_recent on vendor_payables.
--
-- 3. A unique index on items name per workspace. The catalogue had no
--    uniqueness at all, so the same service could be added repeatedly and a
--    duplicate would become the default line item in new transactions.
--
--    Created only when the data is already clean. Failing a migration because of
--    pre-existing duplicates would strand the deploy, and silently merging or
--    deleting a user's catalogue entries is not this migration's call — it emits
--    a NOTICE naming the offenders and leaves the index absent until they are
--    resolved. Run: select name, count(*) from items group by user_id, lower(name)
--    having count(*) > 1;

-- ── 1. Archive state for the supplier register ───────────────────────────
ALTER TABLE vendor_payees
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ── 2. Tenant index (the table had none) ─────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_payees_user ON vendor_payees (user_id);

-- Name lookups for search/sort, now that the register carries money columns.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_payees_user_name
  ON vendor_payees (user_id, lower(name));

-- ── 3. Catalogue uniqueness, when the data allows it ─────────────────────
DO $$
DECLARE
  dupes text;
BEGIN
  -- min(name) because the collision key is lower(name): two rows differing only
  -- by case are ONE duplicate group, and selecting the raw name (which is not in
  -- the GROUP BY) is a hard SQL error.
  SELECT string_agg(DISTINCT x.name, ', ' ORDER BY x.name) INTO dupes
  FROM (
    SELECT min(i.name) AS name
    FROM items i
    GROUP BY i.user_id, lower(i.name)
    HAVING count(*) > 1
  ) x;

  IF dupes IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_items_user_name
      ON items (user_id, lower(name));
  ELSE
    RAISE NOTICE 'uq_items_user_name NOT created — duplicate catalogue names: %', dupes;
  END IF;
END $$;
