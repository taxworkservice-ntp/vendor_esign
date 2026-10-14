# Future plan: auto-email the vendor after signing

**Status: deferred — not started.** This document is the agreed implementation plan
for sending the receipt (and later, other documents) to the vendor by email after
they sign. See also the master prompt §15 ("Still deferred").

## Goal

When a vendor signs a receipt link, the system automatically emails them the
issued receipt PDF — so the vendor has proof of payment without the client
having to forward anything.

## Use case (as agreed)

- **Cast:** client `ABC Accounting Co., Ltd.` (workspace `ABC`) → vendor `นายสมชาย ใจดี`
  (`somchai.j@example.com`) → งานขนส่ง gross 18,000.00, WHT 3% (540.00), net 17,460.00.
- **T0** — client sends the sign link `/v/<token>` via LINE (existing flow).
- **T1** — vendor signs. `POST /api/vendor/:token/sign` (`server/src/api.ts:239`)
  stores `vendor_email`, `auth_ref`, signature, consent version, then calls
  `finalizeReceipt` → assigns `RCT-0007-2569-001`, code `A7F3C9`, builds the PDF
  (`server/src/receipts.ts`).
- **T2 (new)** — right after `finalizeReceipt` succeeds, write an outbox row and
  send the email with the in-memory PDF bytes. Best-effort: a send failure never
  fails the signing (vendor response delayed by only a few hundred ms at most).
- **T3** — vendor's inbox:

  ```
  From:     "ABC Accounting Co., Ltd. via TW VendorSign" <no-reply@mail.yourdomain.com>
  Reply-To: accounting@abc.co.th
  To:       somchai.j@example.com
  Subject:  ใบเสร็จรับเงิน เลขที่ RCT-0007-2569-001 — 17,460.00 บาท
  Attach:   RCT-0007-2569-001.pdf
  ```

- **T4** — vendor forwards the PDF to their accountant as proof of payment.
- **Failure handling:** blank email → no send, on-screen download still works;
  hard bounce → outbox flips to `failed`, daily cron retries (bounded), client
  sees it in the transaction email log and can resend / correct the address.

## Agreed defaults (change before building if needed)

- Provider: **Resend**. Sender: **model A** — platform verified domain in `From`,
  client's display name as the visible name, client's address in `Reply-To`.
- Delivery: **inline send + outbox row**, **daily** retry cron (Vercel Hobby-safe).
- Scope for v1: **receipt email on signing only**. Onboarding-evidence email and
  WHT-certificate email are later steps (see "Deferred").

## Why these choices

- **Resend:** simplest HTTP API (no SDK needed), attachments, Thai templates OK,
  **free 3,000/mo** covers the pilot. Pro $20/mo = 50,000. Postmark is the
  fallback ($15/mo per 10k). All sit behind one module, so switching is cheap.
- **Model A** is the Stripe/DocuSign pattern and needs zero client DNS setup.
  Model B (per-tenant `billing@abc.co.th`) is a later switch
  (`emailFromAddress`, `emailReplyTo`, `emailDomainVerified` settings).
- **Vercel constraints (verified):** cron is included on all plans, but Hobby
  allows **once/day** only (minutely needs Pro) — so the retry cron is daily.
  Sending inline before responding avoids the serverless-freeze/`waitUntil`
  problem (`api/entry.js`, `maxDuration: 30`).
- **Idempotency via outbox unique key** `(user_id, kind, entity_id)` — the sign
  token is consumed, so a retry must never double-send.
- **No PDF stored in the outbox** — retries re-read the durable PDF from R2
  (`readStoredDurable`).

## Cost

- **Resend:** $0 to ~2–3k emails/mo → $20/mo (Pro) past ~100/day. At pilot
  volume (hundreds–low thousands) this is **$0**.
- **Vercel:** a few thousand extra function invocations + ~50–150 KB outbound
  each — inside included usage. The only hard limit is the Hobby daily-cron cap.
- **Near-zero:** Neon table (KB), one more cron path (already running
  `/api/cron/vendor-link-expiry`), SPF/DKIM/DMARC DNS records (free).
- **Scale:** SES à la carte (~$0.10/1k) behind the same module if cost dominates.
- **Model B:** Resend +$20/mo per 100 domains, or SES $0.005/tenant/mo.

## Client preparation checklist

1. **Resend account** (or install via Vercel Marketplace → auto-sets `RESEND_API_KEY`).
2. **Sending domain you control**, with **SPF + DKIM + DMARC** verified in
   Resend (e.g. subdomain `mail.yourdomain.com`) — one-time setup.
3. **From address** decision, e.g. `no-reply@mail.yourdomain.com`.
4. **Client Reply-To** — new per-client settings field (recommended) or the
   workspace owner's login email.
5. **Env vars in Vercel:** `RESEND_API_KEY`, `EMAIL_FROM`, optional
   `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_ENABLED` (kill switch).
6. **Plan:** Hobby (daily cron) is fine; Pro only for minute-level retries.
7. Confirm scope (receipt-only v1) and sender model A vs B.

## Implementation

### 1. Migration `030_email_outbox` (up/down)

`email_outbox(id uuid pk, user_id text, kind text, entity_id text,
to_email text, subject text, status text default 'queued',
provider_id text, error text, attempts int default 0,
created_at/sent_at timestamptz)`,
unique `(user_id, kind, entity_id)`, index `(status, created_at)`,
RLS like `p_vendor_invites`.

### 2. `server/src/email.ts`

- `emailConfigured()` — true when `RESEND_API_KEY` + `EMAIL_FROM` set and
  `EMAIL_ENABLED !== 'off'`.
- `sendEmail({ to, subject, html, replyTo, attachments })` — plain `fetch` to
  `https://api.resend.com/emails`, returns `{ ok, id?, error? }`.
- Unconfigured → no-op (mirrors `server/src/r2-storage.ts` degradation).

### 3. `server/src/notifications.ts`

- `renderReceiptEmail(...)` — **pure** Thai HTML + subject (unit-tested),
  styled after `inviteMessageTemplate`.
- `queueReceiptEmail(tenantId, txnId)` — idempotent outbox insert + `attemptSend`.
- `attemptSend(row)` — re-read receipt + authorization + payable + settings,
  read PDF from R2, send, update row, write `email.sent` / `email.failed` via
  `audit()` (`server/src/shared.ts`).
- Guards: `vendor_authorizations.vendor_email` present **and** tenant setting
  `emailReceiptsEnabled` on.

### 4. Hook the flows

- `server/src/api.ts` sign route (after `finalizeReceipt` ok) and client
  finalize route → `await queueReceiptEmail(...)` **inline, try/catch** —
  never blocks or fails the response.
- Body: greeting, number, net + WHT, verify link
  `${PUBLIC_BASE}/verify/${code}`, `authRef`, client attribution; **PDF attached**.

### 5. Retry cron

`GET /api/cron/email-retry` (Bearer-`CRON_SECRET`, same as
`server/src/api.ts:453`) retries `failed` rows with `attempts < 5`.
Add daily schedule (e.g. `0 4 * * *`) to `vercel.json` `crons`.

### 6. Settings + client UI

- `settings-types.ts` + `server/src/settings.ts` + `src/lib/settings.ts`
  (mock defaults): `emailReceiptsEnabled`, `emailReplyTo`, `emailFromName?`.
- `src/pages/Settings.tsx`: **"การแจ้งเตือนทางอีเมล"** block — toggle +
  Reply-To field + From-domain hint.
- Optional: per-transaction email log + resend
  (`POST /api/client/receipts/:id/resend-email`, session-guarded).

### 7. Tests, docs, env

- `server/src/email.test.ts` (stub `global.fetch`): unconfigured no-op;
  configured payload carries `from`/`to`/`reply_to`/attachment. Pure
  `renderReceiptEmail` test.
- Update `.env.example`, `docs/DEPLOY.md`, `docs/API.md`, this doc's status.

## Rollout & rollback

- Test to your own address first (Resend onboarding sender only reaches the
  account owner until the domain is verified).
- Monitor Resend dashboard + `email_outbox` table.
- Rollback = `EMAIL_ENABLED=off` (module no-ops). No data/schema dependency.

## Deferred (after v1)

- **Onboarding-evidence email** — needs a **server-side evidence PDF** first
  (today's evidence card is built client-side; the email could only link to
  `/onboard/<token>` until then).
- **WHT certificate email**, **per-tenant domains (model B)**, **OTP email
  verification**, **CC the client**.
