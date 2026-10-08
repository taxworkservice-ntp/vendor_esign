-- 028 vendor self-onboarding invites (UP)
-- A client sends a link; the vendor fills identity/tax/bank + uploads documents;
-- the client reviews and approves, which creates a vendor_payees row. Removes
-- the manual LINE-chat intake for small vendors.

CREATE TABLE IF NOT EXISTS vendor_invites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL,
  status            text NOT NULL DEFAULT 'invited'
                    CHECK (status IN ('invited','opened','submitted','approved','changes_requested','rejected','expired')),
  token_hash        text NOT NULL UNIQUE,
  token             text,
  label             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  opened_at         timestamptz,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       text,
  review_note       text,
  -- submitted data (present once submitted)
  prefix            text,
  name              text,
  address           text,
  phone             text,
  email             text,
  line_user_id      text,
  tax_id_encrypted  text,
  tax_id_hash       text,
  bank_name         text,
  bank_account_encrypted text,
  account_holder    text,
  id_doc_path       text,
  bank_doc_path     text,
  bank_name_match   boolean,
  consent_version   text,
  consented_at      timestamptz,
  -- set on approval
  vendor_id         uuid,
  duplicate_of      uuid
);

CREATE INDEX IF NOT EXISTS idx_vendor_invites_user ON vendor_invites (user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invites_hash ON vendor_invites (user_id, tax_id_hash);

ALTER TABLE vendor_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_vendor_invites ON vendor_invites;
CREATE POLICY p_vendor_invites ON vendor_invites FOR ALL USING (
  user_id = app_user_id() OR app_is_bookkeeper() OR app_is_super_admin());

-- Bank + document fields on the vendor record (filled from an approved invite),
-- plus a tax-id hash for duplicate detection.
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS bank_account_encrypted text;
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS account_holder text;
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS id_doc_path text;
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS bank_doc_path text;
ALTER TABLE vendor_payees ADD COLUMN IF NOT EXISTS id_number_hash text;
