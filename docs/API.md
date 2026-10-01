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
- **Client data (session-guarded, workspace-scoped, RLS):**
  - `GET/POST /api/client/vendors`, `PATCH /api/client/vendors/:id` — vendor (payee) directory; tax IDs encrypted at rest.
    `GET /vendors?includeArchived=1` also returns archived suppliers; without it
    only active ones come back. Each row carries money context — `outstanding`
    (sum of `net_amount` for statuses other than `cancelled`/`void`, matching the
    transaction list's rule), `txnCount` and `lastActivity` — from one lateral
    join, so the register can show what is owed without an N+1.
    `PATCH /vendors/:id` accepts `isActive` to archive or restore, because a
    supplier referenced by any transaction can never be deleted (409
    `vendor-in-use`).
  - `GET/POST /api/client/items`, `PATCH/DELETE /api/client/items/:id` — service
    catalogue. `GET /items?includeArchived=1` includes retired entries. Names are
    unique per workspace (migration 015); a clash returns 409 `duplicate-item`
    with the existing name. `PATCH` accepts `isActive` to archive or restore.
  - `GET /api/client/transactions`, `GET /api/client/transactions/:id`, `POST /api/client/transactions`
    (create; WHT via `src/lib/wht-calc`, tax ID hashed), `POST /api/client/transactions/:id/send|revoke|void`.
    `send` returns the one-time `token` and stores it (with its hash) for later link re-copy.
  - `GET /api/client/vendors/:id/tax-id` — decrypted vendor tax ID for form prefill (owner/manager).
  - `GET/POST /api/client/wht/vendors`, `GET/POST /api/client/wht/records`, `PATCH /api/client/wht/records/:id`
    — WHT storage; certificate number auto-assigned via `generate_wht_certificate_no()`.
  - `GET /api/client/wht/records` is paged, filtered and aggregated:
    `?month=&q=&formType=&status=&sort=&limit=&offset=`. `month` scopes on
    `issue_date` (the certificate period), not `transfer_date`. `sort` ∈
    `date|vendor|amount|wht` with `-asc`/`-desc`, whitelisted server-side and
    always tie-broken on `id` so paging is deterministic. `limit=0` returns the
    whole set (the print view). Responds `{ records, total, summary }` where
    `summary` is `{ count, amount, whtAmount, filedCount, activeCount, vendors,
    byForm[] }` computed over the **whole filtered set**, not the page — the
    register is reconciled against a filed return, so the headline must not move
    as you page. Rows carry `vendorName` and `vendorTaxId` inline, so the list
    needs no second `/wht/vendors` fetch. `PATCH …/records/:id` with
    `{ status: 'active' | 'done' }` marks a certificate as filed.
  - `GET /api/client/transactions/:id/authorization` — the vendor's signed
    authorization: `{ signedAt, verificationMethod, consentVersion, vendorPrefix,
    vendorName, vendorAddress, maskedId, corrections[], signaturePng }`.
    The `vendor*` fields are what the **vendor** confirmed, which is what the
    issued PDF is built from — the client's receipt sheet must read this rather
    than its own `vendor_payees` row, or the two documents can disagree on a
    name. `corrections` is derived server-side by diffing the authorization
    against the client's record (nothing stores it). `signaturePng` is a data
    URL, or `null` when the stored file cannot be read, so the client can tell
    "not signed" (404) from "signed, image unavailable" (`null`).
  - `GET /api/client/transactions/:id/receipt.pdf` — the **issued** receipt PDF
    (see "Receipts: two documents"). Streams the file written by `finalize`, with
    `X-Pdf-Sha256` and `X-Verification-Code` response headers so the client can
    show what it is handing over. 404 before issuance.
  When `VITE_API_BASE` is set the portal hooks use these; otherwise they run on the mock store.
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

## Roles and tenancy

Three different people are called similar things. Being precise matters,
because the policy text currently promises more than the code delivers.

| Actor | Who | Enforced where |
|---|---|---|
| **Workspace member** | the client (or their accountant) who logs in | `guard()` — session + workspace scope only. **No per-member permission check.** |
| **Platform bookkeeper** | Taxwork's own staff, serving many clients | `admin.ts` (port 8788). The client portal's RLS *also* has a clause for them — see below. |
| **External bookkeeper** | the client's own accountant, who files the return | **not a user of this app.** They receive the issued PDF out of band. No role, no login. |

Facts worth knowing before changing any of this:

- **The client portal is tenant-scoped, full stop.** `guard()`
  (`server/src/data.ts`) takes `u.memberships[0].tenantId` and does not inspect
  the member's role. RBAC over members (owner / manager / client_admin /
  client_user) exists only in the admin app.
- **`app_is_bookkeeper()` and `app_is_super_admin()` are currently unreachable.**
  Every RLS policy reads `user_id = app_user_id() OR app_is_bookkeeper() OR
  app_is_super_admin()`, but those two functions test the `app.role` GUC for the
  literals `'bookkeeper'` and `'super_admin'`, and **no call site ever passes
  those values** to `withTenant` (the portal passes `'client'`). So the clause is
  always false and there is no cross-tenant access today. Either wire it up with
  an audited entry point, or delete the clause — leaving it implies a control
  that is not there.
- **One workspace per login.** `memberships[0]` is picked with no switcher, so a
  user belonging to several workspaces always lands in the first. An assumption,
  not a capability.
- `withTenant`'s `role` argument reaches the database only as the `app.role` GUC.
  Nothing authorizes on it (see `src/server/db.ts`).

## Receipts: two documents, and only one is the receipt

| | Issued PDF | Screen snapshot |
|---|---|---|
| Built by | `POST /api/transactions/:id/finalize` → `buildReceiptPdf` | `src/lib/receipt-pdf.ts` (html2canvas) |
| Vendor signature | embedded | **absent** |
| `pdf_sha256` | recorded on `vendor_receipts` | none |
| Text | real vector text | pixels, freely editable |
| Served by | `GET /api/client/transactions/:id/receipt.pdf` | generated in the browser |

**The issued PDF is the statutory artifact.** The snapshot is a picture of the
screen, useful only before issuance, and the UI labels it as such so it cannot be
mistaken for the receipt. Both the vendor's copy and the client's sheet read the
signature from `GET /api/client/transactions/:id/authorization`; if the image
cannot be loaded, the receipt says so explicitly rather than drawing an empty
signature rule.

## Notes / limits
- Rate limiting is in-memory (single process). Behind multiple replicas,
  move it to Postgres or the proxy.
- `idNumberEncrypted` is stored as-received — wire app-level encryption
  (KMS age-key in env) before handling real IDs; today only fake/seed data.
- Thai PDF shaping caveat: see `server/src/pdf.ts` `[VERIFY]` note.
- `vendor_authorizations` records the signer's `ip` and `user_agent`, but the
  issued PDF does not include them. For a receipt that may reach a tax office
  that is arguably missing provenance — tracked separately.
- Files under `storage/<workspace>/` are read back through
  `resolveStored()` (`server/src/storage.ts`), which refuses absolute paths,
  `..` segments, paths whose first segment is not the caller's workspace, and
  anything that is not a regular file. `signature_image_path` and `pdf_path` are
  database values, so they are treated as untrusted input.
- **Search scoping differs by list, deliberately.** The transaction list and the
  WHT register are paged and filtered in SQL, because they grow with usage. The
  supplier register and the service catalogue are fetched whole and filtered in
  the browser (`src/lib/search-match.ts`), because they are bounded by the
  supplier and service counts rather than by transaction volume — and because
  the tax ID is encrypted at rest with no indexed column, so no server-side
  search can match its last 4 digits. Both inputs are debounced.
- `LineItem` has no `itemId`, and `document_line_items` stores `item_name` as a
  text snapshot with no foreign key, so a catalogue entry cannot report how many
  transactions used it. "Used in N transactions" is deliberately absent from the
  catalogue rather than faked; linking them needs a migration plus a change to
  the transaction create flow.
