-- 033 catalog item tax type + note-only sub-items (UP)
--
-- The catalog becomes the single place tax treatment is decided: each item
-- carries its WHT payment type (rate derives from the workspace table, so
-- rates stay in one place) and optional one-level sub-notes that print under
-- the line on receipts. Sub-notes are descriptive only — they never affect
-- amounts, WHT base, or tax.
--
-- Existing items are backfilled to the standard 'ค่าบริการ' type (present in
-- every tenant's rate table — types are fixed, only rates are editable), so
-- the whole catalog stays usable on day one. The owner adjusts from there.
--
-- canManageCatalog becomes owner-managed by default: the strip below removes
-- the flag from staff memberships (owner holds it implicitly and re-grants
-- per person from Settings → Team). Customized non-empty flag sets are left
-- alone only when they were never granted this flag... in practice every
-- staff row from 032 carries it, so this resets catalog management to the
-- owner as agreed.

ALTER TABLE items ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS sub_items jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE items SET payment_type = 'ค่าบริการ'
WHERE payment_type IS NULL OR payment_type = '';

UPDATE client_members SET permissions = permissions - 'canManageCatalog'
WHERE role IN ('manager', 'officer', 'client_user', 'client_admin')
  AND permissions ? 'canManageCatalog';
