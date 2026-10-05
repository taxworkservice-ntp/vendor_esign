-- Drop the obsolete generate_doc_number(text, text, integer, text) overload.
--
-- 008 defined it (prefix-based); 011 added (text, text, integer, integer)
-- keyed on vendor_no but left the old overload in place. Its
-- ON CONFLICT (user_id, doc_type, be_year) no longer matches any unique
-- constraint after 020 replaced the key, so an untyped 4th argument can
-- resolve to it and fail with "no unique or exclusion constraint matching the
-- ON CONFLICT specification". The current code sends an integer.
DROP FUNCTION IF EXISTS generate_doc_number(text, text, integer, text);
