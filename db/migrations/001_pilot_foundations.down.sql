-- 001 pilot foundations (DOWN) — reverses UP. Drops in dependency order.
DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_events;
DROP FUNCTION IF EXISTS block_audit_mutation();
DROP FUNCTION IF EXISTS next_receipt_number(text, integer, text);
DROP TRIGGER IF EXISTS trg_pt_updated ON payment_transactions;
DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS config;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS receipt_counters;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS authorizations;
DROP TABLE IF EXISTS vendor_requests;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS tenants;
