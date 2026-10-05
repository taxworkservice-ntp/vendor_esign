-- 025 authorization contact snapshot + signing reference.
--
-- The issued receipt is built from the authorization snapshot (what the vendor
-- confirmed), so it could not carry the vendor's phone/email — those lived only
-- on vendor_payees. Snapshot them at signing time, like name/address already are.
--
-- auth_ref gives the signed authorization its own stable identifier (AUTH-…),
-- shown to the vendor immediately, without consuming a receipt number (the
-- statutory receipt number is still assigned only at issuance — no gaps).
ALTER TABLE vendor_authorizations
  ADD COLUMN IF NOT EXISTS vendor_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_ref text NOT NULL DEFAULT '';

-- Backfill a reference for rows signed before this migration (dev/test data).
UPDATE vendor_authorizations
  SET auth_ref = 'AUTH-' || upper(substr(md5(id::text), 1, 8))
  WHERE auth_ref = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_authorizations_ref
  ON vendor_authorizations (auth_ref) WHERE auth_ref <> '';
