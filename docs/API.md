# Pilot API — portable Node server (Hono + Neon)

No host SDKs, no paid services. Binds `127.0.0.1` only — put behind a
reverse proxy (or SSH tunnel) for any non-local access.

## Run
```bash
npm run api:dev     # watch mode (tsx)
npm run api:start   # single run
```

## Endpoints
- `GET /api/health` — `{ ok, tenant }`
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
  Errors: `not-signed` (422), `already-issued` (409).
- `GET /api/verify/:code` — public: number, status, issue date, masked vendor.

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
