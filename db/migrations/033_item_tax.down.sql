-- The permission strip is intentionally not reversed: re-granting catalog
-- access is the owner's explicit act in Settings → Team, not a rollback.
ALTER TABLE items DROP COLUMN IF EXISTS sub_items;
ALTER TABLE items DROP COLUMN IF EXISTS payment_type;
