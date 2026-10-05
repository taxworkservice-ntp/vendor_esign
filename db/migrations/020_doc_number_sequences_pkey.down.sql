ALTER TABLE doc_number_sequences DROP CONSTRAINT IF EXISTS doc_number_sequences_pkey;
ALTER TABLE doc_number_sequences ADD CONSTRAINT receipt_counters_pkey PRIMARY KEY (user_id, be_year);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dns_scope
  ON doc_number_sequences (user_id, doc_type, be_year, vendor_no);
