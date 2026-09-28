# Restore — pilot

Backups live in `backups/backup-YYYY-MM-DD/db.sql` (see `scripts/weekly-export.sh`).

## Restore database
```bash
# Point at the target database (STAGING first, verify, then prod)
psql "$NETLIFY_DATABASE_URL" < backups/backup-2026-09-28/db.sql
npm run db:verify
```

## Restore storage files
Copy `slips/`, `signatures/`, `pdfs/` back to the private buckets with the same
paths (receipt rows reference `pdf_path` / `slip_file_path` verbatim).
Keep bucket ACLs private; re-issue signed URLs only (short TTL).

## Checks after restore
1. `npm run db:verify` → `verify: OK`
2. Open 2–3 receipts, confirm PDFs/slips load
3. Confirm latest `receipt_counters.last_number` matches the newest receipt number
