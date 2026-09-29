# Pilot API — portable Node server (Hono + Neon), two isolated operations

No host SDKs, no paid services. Both bind `127.0.0.1` only — put behind a
reverse proxy (or SSH tunnel) for any non-local access.

- Public operation `server/src/api.ts` → `PORT` (8787): vendor links, signing,
  finalize, QR verify. No login.
- Admin operation `server/src/admin.ts` → `ADMIN_PORT` (8788): login,
  tenants/users management. Separate `tw_admin` cookie (12h), optional
  `ADMIN_IP_ALLOWLIST`, shared helpers in `server/src/shared.ts`.

## Run
```bash
npm run api:dev     # watch mode: serves BOTH ports (tsx)
npm run api:start   # single run: serves BOTH ports
ADMIN_EMAIL=you@taxwork.local npm run db:seed-admin  # bootstrap super_admin (prints temp pw once)
```

## Endpoints (public :8787)
- `GET /api/health` — `{ ok, operation: 'public', tenant }`
- `POST /api/auth/login` — client portal login (admin-provisioned). Body `{ email, password }`
  → `tw_session` cookie (7d), `{ email, mustChangePw, memberships }`. Requires a
  client role. Account lockout after 5 failures / 15 min (in-memory) + per-IP limit.
- `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`
  (min 8 chars; clears `must_change_pw`).
- `GET /api/vendor/:token` — vendor's own transaction, masked fields.
  First open stamps `opened_at` and flips `sent → opened`. Errors:
  `invalid-or-expired` (404 wrong / 410 used, revoked, or past `expires_at`).
- `POST /api/vendor/:token/sign` — body `{ vendorName, vendorAddress,
  idNumberEncrypted?, idLast4, signaturePng (dataURL), consentVersion: 'v1',
  lineUserId? }`. Single-use: consumes the token, inserts the
  `authorizations` row, flips to `signed`, writes the audit event.
  `verification_method` is `'stub-deferred'` until the LINE step.
  Rate-limited (10/min/IP). Errors: `invalid-body`, `invalid-signature`,
  `invalid-or-expired`, `already-signed`.
- `POST /api/transactions/:id/finalize` — requires a signed authorization.
  Assigns the series number via `next_receipt_number()` in the same txn as
  the receipt insert (never `MAX()+1`), builds the PDF, stores SHA-256.
  Retry-safe: a numbered-but-PDF-less receipt reuses its number.
  The receipt PDF renders `payment_transactions.line_items`
  ([{ description, amount }]) as a paginated A4 item table with an optional
  `note` header; empty/legacy rows fall back to `description` + `gross_amount`.
  Errors: `not-signed` (422), `already-issued` (409).
- `GET /api/verify/:code` — public: number, status, issue date, masked vendor.
- `GET /api/cron/vendor-link-expiry` — **protected** (`Authorization: Bearer $CRON_SECRET`);
  marks payments whose vendor link lapsed as `expired`. `503` if `CRON_SECRET` unset.
- `GET /api/settings`, `PUT /api/settings` — tenant settings (session-guarded; owner/manager writes).
- `POST /api/wht/*` — WHT certificates are rendered client-side from the exact
  invoice-system template (`/wht/print`, see `src/pages/WhtPrint.tsx`).
- `GET /api/vendors/:id/memory` — remembered defaults for a vendor, derived from
  history (excludes `draft`/`void`/`cancelled`): `{ last: { lineItems, paymentType,
  whtRate, note } | null, items: [{ description, lastAmount, timesUsed, lastUsedAt }] }`
  (catalog ordered by frequency then recency, max 20). **401 until client API auth
  ships** — it requires a session scoped to the vendor's tenant. The client uses the
  mock source meanwhile (`VITE_FEATURE_VENDOR_MEMORY=off` disables recall).

## Endpoints (admin :8788)
- `POST /api/login` — `{ email, password }` → `tw_admin` cookie (12h), `{ mustChangePw, memberships }`. 5/min/IP.
- `POST /api/logout`, `GET /api/me`, `POST /api/change-password` (≥10 chars, clears temp flag).
- `GET/POST /api/admin/tenants`, `GET/PATCH /api/admin/tenants/:id` (super_admin for writes).
- `GET/POST /api/admin/tenants/:id/users` (super_admin, or client_admin for own tenant, client_user only).
- `POST /api/admin/users/:userId/reset|disable` — returns temp pw once / revokes sessions. All write audit events.

## Smoke test (needs live DB)
```bash
npm run db:migrate && npm run db:seed
npm run api:dev &
# create a vendor_requests row for a seeded txn (psql), then:
curl localhost:8787/api/vendor/<token>
curl -X POST localhost:8787/api/vendor/<token>/sign -H 'Content-Type: application/json' -d '{...}'
curl -X POST localhost:8787/api/transactions/<id>/finalize
curl localhost:8787/api/verify/<CODE>
```

## Notes / limits
- Rate limiting is in-memory (single process). Behind multiple replicas,
  move it to Postgres or the proxy.
- `idNumberEncrypted` is stored as-received — wire app-level encryption
  (KMS age-key in env) before handling real IDs; today only fake/seed data.
- Thai PDF shaping caveat: see `server/src/pdf.ts` `[VERIFY]` note.
