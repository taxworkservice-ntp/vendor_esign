-- The consent-text rewrite is intentionally not reversed: restoring the legacy
-- wording would downgrade legal evidence already shown to vendors.
ALTER TABLE vendor_authorizations DROP COLUMN IF EXISTS consent_sha256;
ALTER TABLE vendor_authorizations DROP COLUMN IF EXISTS consent_text;
