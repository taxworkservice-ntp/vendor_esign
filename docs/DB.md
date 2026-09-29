# Database — Neon Postgres (`cold-meadow-09162217`)

Any Postgres works (Neon direct or Netlify DB, which is Neon under the hood).
Source of truth: `db/migrations/*.up.sql` (reversible via `*.down.sql`).
Drizzle `src/server/schema.ts` mirrors it for typed server queries only.

## Connect (2 min, secrets stay local)
**Neon direct (recommended):** console.neon.tech → your project →
**Connect** → copy the **pooled** connection string (`*-pooler*`, `sslmode=require`).
**Netlify DB (alternative):** site → **Data → cold-meadow-09162217 → Connect** →
copy the pooled string. The `napi_*` token is NOT needed for this — it is a
Netlify API token, not the database password; revoke it if unused.

Then: `cp .env.example .env.local` and paste the string as `DATABASE_URL=...`
(`NETLIFY_DATABASE_URL=` also works). Never commit `.env.local`.

## Run
- `npm run db:migrate` — applies `001`…`006` in order (`$$`-aware splitter).
- `npm run db:seed` — fake demo rows only (`SEED-*`, `enc:FAKE-*`).
- `npm run db:verify` — read-only: tables, RLS, `next_receipt_number()`, config.

## Architecture notes (hosting-sensitive, [DECISION])
- Browser never connects to Postgres. Only `scripts/*` and future
  Netlify Functions import `src/server/db.ts` (service credentials).
- RLS uses `SET LOCAL app.tenant_id / app.role` per request
  (`withTenant()`); bookkeeper bypasses tenant isolation.
- Receipt numbers: call `next_receipt_number()` INSIDE the same txn as the
  `receipts` insert (`FOR UPDATE` lock — never `MAX()+1`). Unique
  `(tenant_id, number)` is the backstop; rollback returns the number.
- Audit is append-only via trigger; `UPDATE/DELETE` raises.
- Vendor recall (`006`): partial index `idx_pt_vendor_recent` on
  `(tenant_id, vendor_id, created_at DESC) WHERE status NOT IN
  ('draft','void','cancelled')` backs the derived vendor-memory query. Memory is
  computed at read time — no extra stored copy of item text.
- Vendor tax IDs (`vendors.id_number_encrypted`) are AES-256-GCM encrypted with
  `ID_ENCRYPTION_KEY` (`server/src/crypto.ts`), format `enc:v1:<iv>:<tag>:<ct>`.
  Never store plaintext, never log it. The client portal's mock equivalent
  (`src/lib/id-crypto.ts`) keeps the key in localStorage — dev-only, not a
  production key store.
- Weekly backup: `pg_dump "$NETLIFY_DATABASE_URL" > backup-$(date +%F).sql`
  plus storage files; restore with `psql`. (Full export script = pilot-ops slice.)

## Troubleshoot
- `Missing DATABASE_URL` → `.env.local` not loaded; check filename + key name.
- `ENOTFOUND` → unpooled host or missing `sslmode=require`; use pooled string.
- Multi-statement errors → paste the failing `.up.sql` into Neon SQL Editor
  (same statements, no app change needed).
