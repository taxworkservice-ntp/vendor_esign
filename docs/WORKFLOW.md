# End-to-end workflow — client ⇄ vendor

The lifecycle of one vendor payment, from the operator provisioning a client to a
voided receipt. Actors, states, artifacts and audit events.

## Actors
- **Platform admin** — the operator console (`server/src/admin.ts`, isolated app).
- **Client user** — the customer's staff (owner / manager / officer), client portal.
- **Vendor** — the payee. No account; acts through a one-time link.
- **Public verifier** — anyone scanning a receipt QR.

## Stages

| # | Stage | Trigger / route | Result |
|---|-------|-----------------|--------|
| 0 | Provision | admin creates client + user (`/api/admin/tenants`, `/users`) | temp password (7-day, forced change), audit `user.reset` |
| 1 | Login | `POST /api/auth/login` (`server/src/client-auth.ts`) | session row (hashed token) |
| 2 | Add vendor | `POST /api/client/vendors` (`server/src/data.ts`) | `vendor_payees`, national ID **AES-256-GCM encrypted**, running `vendor_no` |
| 3 | (opt) Item | `POST /api/client/items` | `items` catalog |
| 4 | Create txn → `draft` | `POST /api/client/transactions` (`server/src/transactions.ts`) | `vendor_payables`; WHT re-derived server-side; `tax_id_hash` + `tax_id_last4` for the gate |
| 5 | Send link → `sent` | `POST /api/client/transactions/:id/send` | `vendor_requests` (token stored **encrypted**, hash for lookup; 7-day expiry) |
| 6 | Vendor opens → `opened` | `GET /api/vendor/:token` (`server/src/api.ts`) | stamps `opened_at`; audit `vendor.opened`; **content withheld until unlocked** |
| 7 | ID gate | `POST /api/vendor/:token/unlock` | compares sha256(tax ID) with `timingSafeEqual`; rate-limited (`gate_attempts`); audit `vendor.unlocked` / `vendor.gate-failed` |
| 8 | Sign → `signed` | `POST /api/vendor/:token/sign` | immutable `vendor_authorizations` snapshot + signature; token consumed (`used_at`); audit `vendor.signed` |
| 9 | Issue → `issued` | auto in sign via `finalizeReceipt` (`server/src/receipts.ts`); client fallback `POST /api/transactions/:id/finalize` (**session-guarded**) | `generate_doc_number` (row-lock), `vendor_receipts` + PDF, auto `wht_records`; audit `receipt.issued` |
| 10 | Vendor copy | `VendorSign.tsx` / `/v/receipt/:id` | download receipt (number + verification code) |
| 11 | Client after | register `/receipts`, ZIP, WHT `/wht`, metrics, QR verify `/api/verify/:code` | — |
| 12 | Exceptions | `revoke` → `cancelled`; cron → `expired`; `void` → `void` (propagates to receipt, WHT, links; audit `receipt.voided`) | — |

## State machine (`vendor_payables.status`)
```
draft ─send→ sent ─open→ opened ─sign→ signed ─finalize→ issued
  └──────────── cancelled (revoke)      expired (cron) ─resend↺
issued ─void→ void
```

## Artifacts
- **Tables**: `vendor_payees`, `vendor_payables`, `vendor_requests`, `vendor_authorizations`, `vendor_receipts`, `wht_vendors`, `wht_records`, `sessions`, `audit_events`, `rate_hits`, `gate_attempts`.
- **Storage**: signature PNG (`signatures/<txn>.png`), receipt PDF (`pdfs/<number>.pdf`) — R2 or local seam.
- **Audit**: `vendor.opened`, `vendor.unlocked`, `vendor.gate-failed`, `vendor.signed`, `receipt.issued`, `receipt.voided`.

## Invariants
- Numbers are never reused; issuance is idempotent (`generate_doc_number`, unique `(user_id, number)`).
- The receipt PDF and its SHA-256 are immutable; the original is kept on void.
- Void is a status transition, not a delete — it propagates to every derived artifact.

## Verification
- `npm run db:live` walks the flow at the data level (draft → … → void) against an embedded Postgres.
- `npm test` covers the pure logic; `npm run lint` type-checks the server and client.
