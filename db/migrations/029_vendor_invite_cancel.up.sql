-- 029 vendor invite cancellation (UP)
-- A client can close an invite the vendor never answered. 'cancelled' is
-- distinct from 'expired' (which the system derives from the 30-day TTL).
ALTER TABLE vendor_invites DROP CONSTRAINT IF EXISTS vendor_invites_status_check;
ALTER TABLE vendor_invites
  ADD CONSTRAINT vendor_invites_status_check
  CHECK (status IN ('invited','opened','submitted','approved','changes_requested','rejected','expired','cancelled'));
