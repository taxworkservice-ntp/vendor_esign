-- 014 transaction list performance + slip uniqueness (UP)
--
-- 1. Slip reference uniqueness. 001 created UNIQUE (tenant_id, slip_reference)
--    and 008 renamed that key to user_id, so the constraint still stands. But
--    slip_reference is NOT NULL and the API writes '' when no slip is supplied
--    — and a slip is explicitly optional at creation (it can be attached later
--    via POST /transactions/:id/slip). Plain UNIQUE therefore permits exactly
--    ONE slip-less transaction per workspace: the second POST fails with a
--    23505. Replaced with a partial unique index over non-empty references,
--    which is what the rule was always meant to express.
--
-- 2. List indexes. The transaction list is the app's home screen and its access
--    path is (user_id, transfer_date) — but no index on transfer_date existed
--    at all. The surviving indexes (idx_pt_tenant_status on user_id,status and
--    idx_pt_vendor_recent on user_id,vendor_id,created_at) cannot serve a
--    month-scoped range ordered by date, so every page load scanned the
--    workspace. CONCURRENTLY avoids taking a write lock on a live table;
--    scripts/migrate.mjs runs statements outside a transaction, so it applies.
--
-- Reversible via 014 down migration.

-- ── 1. Slip reference: unique only when one was actually supplied ──────────
-- The constraint is located by its columns rather than by name: 008 renamed the
-- table and column but Postgres keeps the ORIGINAL constraint name
-- (payment_transactions_tenant_id_slip_reference_key), so a DROP CONSTRAINT
-- guessing the post-rename name silently does nothing.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'vendor_payables'::regclass
     AND contype = 'u'
     AND conkey = ARRAY[
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'vendor_payables'::regclass AND attname = 'user_id'),
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'vendor_payables'::regclass AND attname = 'slip_reference')
     ];
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE vendor_payables DROP CONSTRAINT %I', c);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vp_slip_reference
  ON vendor_payables (user_id, slip_reference)
  WHERE slip_reference <> '';

-- ── 2. List access paths ──────────────────────────────────────────────────
-- Primary: month scope + date sort. id last so the sort is total and
-- limit/offset paging cannot repeat or skip a row.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vp_user_date
  ON vendor_payables (user_id, transfer_date DESC, id);

-- Status chips narrow to a handful of statuses, then order by date.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vp_user_status_date
  ON vendor_payables (user_id, status, transfer_date DESC, id);

-- Amount columns are sortable from the table header.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vp_user_net
  ON vendor_payables (user_id, net_amount DESC, id);
