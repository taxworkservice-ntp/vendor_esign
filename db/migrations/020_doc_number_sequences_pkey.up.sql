-- Fix doc_number_sequences keying.
--
-- 011 re-keyed receipt numbering to (user_id, doc_type, be_year, vendor_no) and
-- added idx_dns_scope, but it left the legacy primary key (user_id, be_year)
-- from 001 in place and left vendor_no nullable. The legacy PK rejects the
-- second doc_type/vendor for a tenant, so generate_doc_number() fails with
-- "duplicate key value violates unique constraint receipt_counters_pkey".
UPDATE doc_number_sequences SET vendor_no = 0 WHERE vendor_no IS NULL;
ALTER TABLE doc_number_sequences ALTER COLUMN vendor_no SET DEFAULT 0;
ALTER TABLE doc_number_sequences ALTER COLUMN vendor_no SET NOT NULL;
ALTER TABLE doc_number_sequences DROP CONSTRAINT IF EXISTS receipt_counters_pkey;
DROP INDEX IF EXISTS idx_dns_scope;
ALTER TABLE doc_number_sequences ADD CONSTRAINT doc_number_sequences_pkey
  PRIMARY KEY (user_id, doc_type, be_year, vendor_no);
