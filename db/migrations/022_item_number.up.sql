-- 022 per-item registry number.
--
-- The service catalogue had no human-readable identifier — 008 gave items only a
-- uuid. Add item_no, a per-workspace running number (displayed ITM-001, …),
-- mirroring vendor_payees.vendor_no. Backfilled by creation order so existing
-- catalogues get a stable, gap-free sequence. The number is assigned on create
-- by the API (max+1 per workspace), same pattern as vendor_no.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_no integer NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM items
)
UPDATE items i SET item_no = n.rn
FROM numbered n WHERE i.id = n.id AND i.item_no = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_items_user_no ON items (user_id, item_no);
