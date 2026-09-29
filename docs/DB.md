# Database — Neon Postgres (`cold-meadow-09162217`)

Any Postgres works (Neon direct or Netlify DB, which is Neon under the hood).
Source of truth: `db/migrations/*.up.sql` (reversible via `*.down.sql`).
Drizzle `src/server/schema.ts` mirrors it for typed server queries only.

> **Invoice-system alignment (`008`).** Tables/columns were renamed to the host's
> conventions so a future move to Supabase is a copy + RLS-helper swap, not a
> rewrite. We stay on Neon with **custom auth** for now (text ids — uuid at the
> Supabase move). RLS is written against `app_user_id()` (reads
> `current_setting('app.user_id')`), which becomes `auth.uid()` on Supabase.
>
> | Old (≤007) | New (`008`) |
> |---|---|
> | `tenants` | `client_profiles` |
> | `app_users` | `profiles` + `auth_credentials` |
> | `user_tenants` | `client_members` (`workspace_user_id`, `member_user_id`, `permissions`) |
> | `vendors` | `vendor_payees` |
> | `payment_transactions` | `vendor_payables` |
> | `receipts` | `vendor_receipts` (+ `documents`-shaped columns; `document_line_items` with `discount`) |
> | `receipt_counters` / `next_receipt_number()` | `doc_number_sequences` / `generate_doc_number()` |
> | `authorizations` | `vendor_authorizations` |
> | `tenant_id` columns | `user_id` (workspace key) |
>
> Added: `wht_records` (column-exact host shape), `client_permission_audit`.
> `config` remains a Neon-only settings shim until P2 folds it into
> `client_profiles`/`doc_number_sequences`. `[VERIFY]` — run this migration on a
> real DB and reconcile `wht_records` columns against invoice-system
> `sql/add_wht_*.sql` before enabling WHT.

## Connect (2 min, secrets stay local)
**Neon direct (recommended):** console.neon.tech → your project →
**Connect** → copy the **pooled** connection string (`*-pooler*`, `sslmode=require`).
**Netlify DB (alternative):** site → **Data → cold-meadow-09162217 → Connect** →
copy the pooled string. The `napi_*` token is NOT needed for this — it is a
Netlify API token, not the database password; revoke it if unused.

Then: `cp .env.example .env.local` and paste the string as `DATABASE_URL=...`
(`NETLIFY_DATABASE_URL=` also works). Never commit `.env.local`.

## Run
- `npm run db:migrate` — applies `001`…`008` in order (`$$`-aware splitter).
- `npm run db:seed` — fake demo rows only (`SEED-*`, `enc:FAKE-*`).
- `npm run db:verify` — read-only: tables, RLS, `generate_doc_number()`, config.

## Architecture notes (hosting-sensitive, [DECISION])
- Browser never connects to Postgres. Only `scripts/*` and the server ops
  (`server/src/*`, `src/server/db.ts`) use service credentials.
- RLS: `withTenant()` sets `app.user_id` (workspace) + `app.role` per request;
  policies read `user_id = app_user_id()` (bookkeeper/super_admin bypass).
- Receipt numbers: call `generate_doc_number(user_id, doc_type, year, prefix)`
  INSIDE the same txn as the `vendor_receipts` insert (`FOR UPDATE` lock — never
  `MAX()+1`). Unique `(user_id, number)` is the backstop.
- Audit is append-only via trigger; `UPDATE/DELETE` raises.
- Vendor recall (`006`): partial index `idx_pt_vendor_recent` on
  `(user_id, vendor_id, created_at DESC) WHERE status NOT IN
  ('draft','void','cancelled')` backs the derived vendor-memory query.
- Vendor tax IDs (`vendor_payees.id_number_encrypted`) are AES-256-GCM encrypted
  with `ID_ENCRYPTION_KEY` (`server/src/crypto.ts`), format `enc:v1:<iv>:<tag>:<ct>`.
  Never store plaintext, never log it. The client portal's mock equivalent
  (`src/lib/id-crypto.ts`) keeps the key in localStorage — dev-only.
- Weekly backup: `pg_dump "$NETLIFY_DATABASE_URL" > backup-$(date +%F).sql`
  plus storage files; restore with `psql`.

## Troubleshoot
- `Missing DATABASE_URL` → `.env.local` not loaded; check filename + key name.
- `ENOTFOUND` → unpooled host or missing `sslmode=require`; use pooled string.
- Multi-statement errors → paste the failing `.up.sql` into Neon SQL Editor
  (same statements, no app change needed).
