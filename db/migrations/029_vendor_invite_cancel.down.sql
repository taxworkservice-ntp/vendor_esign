-- 029 vendor invite cancellation (DOWN)
ALTER TABLE vendor_invites DROP CONSTRAINT IF EXISTS vendor_invites_status_check;
UPDATE vendor_invites SET status = 'expired' WHERE status = 'cancelled';
ALTER TABLE vendor_invites
  ADD CONSTRAINT vendor_invites_status_check
  CHECK (status IN ('invited','opened','submitted','approved','changes_requested','rejected','expired'));
