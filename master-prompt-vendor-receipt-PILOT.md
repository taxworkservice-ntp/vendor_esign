# MASTER PROMPT (PILOT): Vendor Receipt Authorization Module (Taxwork)

This is the trimmed version for a pilot with **one client**. Build only what is listed here. Anything under "Not in the pilot" must not be built, even if it seems easy.

> For the WHT withholding certificate form (ใบรับรองการหักภาษี ณ ที่จ่าย) — its exact coordinates, tax-ID cell geometry, print/PDF pipeline, and download races — see **`master-prompt-wht-form.md`**.

## 0. How to work

- **Read before you write.** Before any change, read the whole existing codebase that this module touches: auth, tenant/role model, existing tables and RLS policies, storage buckets, UI components, routing, and naming conventions. Read each relevant file in full. Follow the conventions you find. Do not refactor unrelated code.
- **Work in the three phases in section 11.** At the end of each phase, stop and report: what was built, what was decided, what is unclear, and how to test it. Do not start the next phase until I confirm.
- **When the spec conflicts with the existing code, stop and ask.**
- **Never invent tax rules.** Anything marked `[CONFIG]` must be editable configuration, never hard-coded. Anything marked `[VERIFY]` must be left as a labelled TODO and listed in your report for the accountant to confirm.
- Small, reviewable commits. Every phase ships with tests.

## 1. Context

Taxwork is a Thai bookkeeping service with a multi-tenant client portal (React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query v5, Supabase). This module handles small vendors who cannot issue proper receipts. The pilot runs for a single client (one tenant) and a small number of vendors. The product owner is a senior bookkeeper who reviews every document by hand.

**Cost constraint:** the pilot should run on free tiers where the terms allow it. Do not add any paid service or dependency. The hosting target is **undecided** (`[DECISION]`): keep the app portable, do not assume a specific host, and list in your report every place where a hosting choice affects the code.

## 2. Workflow

1. **A client user creates a transaction:** vendor, payment type, description, gross amount, WHT if applicable, transfer date, and the transfer slip (required).
2. **The client copies a unique link** and sends it to the vendor in their own LINE chat. The system does not send messages.
3. **The vendor opens a mobile page** that looks like the real document. Client-entered fields are locked. The vendor fills in name, address, and 13-digit ID number, draws a signature, ticks the confirmation, and verifies through **LINE Login (LIFF)**.
4. **This single signature does two things:** it confirms the vendor received the money, and it authorizes the client, as representative, to issue the receipt for this one transaction in the vendor's name.
5. **On signing, the system issues the receipt:** assigns the number, generates the PDF, stores it, and marks the transaction issued.
6. **The client prints or downloads it, signs as representative, and sends it to the bookkeeper.**
7. **The bookkeeper reviews it** from a simple list.

## 3. Non-negotiable rules

1. The vendor's signature and confirmation is captured **for each transaction**. Never issue a receipt without it. Never auto-sign for a vendor.
2. Per-transaction authorization only. No standing permissions.
3. The document states plainly that it was issued by the client's representative on behalf of and with the authorization of the vendor.
4. **Never produce a tax invoice.** Receipt only. If the vendor says they are VAT-registered, block issuing and tell the client to request a real tax invoice from the vendor.
5. Documents are never deleted. Wrong documents are **voided** with a reason and replaced with a new number.
6. Every state change writes an append-only audit event.
7. Sensitive data (ID numbers, slips, signatures) is minimised, access-controlled, and not exposed to unauthenticated users except the single vendor page for their own transaction.

## 4. Data model (write migrations; follow existing conventions)

Add tenant_id and standard timestamps everywhere.

- **vendors:** name, address, ID number (encrypted), LINE user id, is_vat_registered.
- **payment_transactions:** vendor_id, payment_type, description, gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_file_path, slip_reference, status, created_by. Payment method is always bank transfer in the pilot.
- **vendor_requests:** transaction_id, token_hash (store only a hash), expires_at, used_at, opened_at, revoked_at.
- **authorizations:** transaction_id, vendor snapshot as signed, signature_image_path, verification_method, LINE user id, ip, user_agent, signed_at, consent_text_version.
- **receipts:** transaction_id, number, issue_date, pdf_path, pdf_sha256, verification_code, status (issued / void), void_reason, voided_at, replaced_by.
- **receipt_counters:** tenant_id, be_year, last_number. Unique on tenant + year.
- **audit_events:** entity type and id, event type, actor, metadata, ip, timestamp. Append-only: block update and delete.
- **config:** `[CONFIG]` WHT rates by payment type, stamp-duty warning threshold, link expiry days, consent text versions.

Transaction status: `draft → sent → opened → signed → issued`, plus `expired`, `cancelled`, `void`.

## 5. Security and access

- **The vendor page has no direct database access.** All vendor actions go through server functions that validate the token, load only that one transaction, and write with a service role. No public RLS policy on these tables.
- Tokens: 32+ bytes random, single-use for signing, expiring, revocable. Store only the hash. Rate-limit token attempts.
- **RLS:** the client user sees only their tenant's data. The bookkeeper role sees everything. Write policies and tests for each role.
- Storage: private buckets for slips, signatures, and PDFs, with short-lived signed URLs only.
- Encrypt the ID number at rest. Mask it in every screen except the printed receipt and the reviewer's detail view.
- **PDPA:** show a short privacy notice on the vendor page before they enter data (what is collected, why, who sees it, how long it is kept `[VERIFY]`), and keep an access log for anyone viewing ID data. Collect the ID **number** only. Do not collect ID card images in the pilot.
- Never log ID numbers, tokens, or personal data.

## 6. Numbering

- One series for the pilot client: `{CLIENTCODE}-R-{BEYEAR}-{NNNN}`, for example `ABC-R-2569-0001`. Resets each Buddhist year.
- **Assign the number only when the vendor signs**, never at request creation. Requests use an internal request ID.
- Increment the counter inside the same database transaction that creates the receipt row, using a row lock. Never compute "max + 1". Add a unique constraint on tenant + number as a backstop. A failed finalization rolls back the counter.
- If PDF generation fails after the number is issued, retry with the same number.
- Support a "start from" number so the series can continue from any existing paper series.
- Every receipt gets a random verification code and a QR linking to a page that shows only status, issue date, and masked details.

## 7. Payment evidence (bank transfer only)

- Require a slip upload. Capture the transfer reference number and reject a reference already used on another transaction.
- Compare the slip amount to the expected **net** amount (gross minus WHT). Flag a mismatch for review; do not silently accept it.
- Compare the receiver name on the slip to the vendor name loosely. Flag, don't block.
- The receipt date must not be earlier than the transfer date.
- No automated slip verification in the pilot. The bookkeeper checks the slip by eye.

## 8. Signature and verification

- Draw-signature on a canvas (touch and mouse), exported as PNG, with a clear button. Reject an empty canvas.
- Verification is **LINE Login through LIFF only**. Store the LINE user id and the time. No SMS in the pilot.
- The consent text is versioned and the version is stored. It states: I received this amount; I authorize [client name] to issue a receipt in my name for this transaction only.
- The signing audit event records time, IP, user agent, verification method, and LINE user id.

## 9. PDF and document content

- **Single renderer, raster for download.** The receipt is authored once as the
  HTML/CSS sheet (`src/components/receipt/receipt-sheet.tsx`, `ReceiptSheet`) and
  shown on screen. The download rasterises that exact DOM with html-to-image
  (`src/lib/receipt-to-a4-pdf.ts`) so preview == PDF — same layout, same Sarabun,
  same browser Thai shaping — for the client **and** the vendor (`ReceiptSheet` is
  also rendered offscreen on the vendor success screen and rasterised locally).
  Never add a second, hand-coded PDF layout: a server pdf-lib renderer drifts in
  layout and cannot position Thai combining marks (it produced `ที่ อยู่`,
  `รวมเป็  นเงิน`, ISO dates). The server `pdf-lib` output is kept **only** as the
  internal/audit artifact (embeds the signature even when the image can't be
  fetched; the fallback button uses it). The buyer block is the workspace profile
  (`useSettings` → `displayName/address/taxId`), never the mock client registry.
- A4, print-ready. Buddhist-era dates.
- **Receipt register + batch ZIP.** Issued receipts are listed at `/receipts`
  (nav "ใบเสร็จรับเงิน"), scoped by the receipt's **issue date** — a document
  belongs to the period it was issued, not the payment date (mirrors the WHT
  register). `GET /api/client/receipts` returns the register (server
  `server/src/receipts-register.ts`; sort/search/ORDER BY whitelisted). The
  "ดาวน์โหลดทั้งหมด" button opens `/receipts/download?...&download=1`, which
  renders each row through `ReceiptSheet` offscreen, rasterises one PDF per
  receipt and zips them (`fflate`, one file per receipt). A receipt whose
  signature image cannot be fetched falls back to the archived server PDF for
  that one row rather than shipping a placeholder — never drop a statutory
  document, and report the fallback count.
- Amount in Thai words with a tested utility. Example: 2,910.00 → `สองพันเก้าร้อยสิบบาทถ้วน`. Cover satang, zero, millions, and the "เอ็ด" and "ยี่" rules with unit tests.
- Contents: title "ใบเสร็จรับเงิน"; number; date; seller block (vendor name, address, ID); buyer block (client name, address, tax ID); description; gross amount; WHT rate and amount when applicable; net amount received; amount in words; transfer date and reference; a statement that the seller is not VAT-registered; vendor signature image; representative signature line with name and position; authorization statement; verification footer with time, method, code, QR, and file hash.
- Show a stamp-duty warning on large amounts above the `[CONFIG]` threshold. `[VERIFY]` the rule, including any duty on the authorization.
- Store the SHA-256 of the final PDF.

## 10. Screens

**Client:** create-transaction form (WHT and net computed live from config; slip upload), transaction list with status filters, and a detail page with a timeline, copy-link, revoke link, void, and download/print.

**Vendor (mobile-first, no account):** the document preview with locked fields visibly marked, the editable fields, the signature pad, the confirmation tick, the LINE verification step, and a success page with a copy of the receipt. Clear Thai copy, large touch targets, and it must work inside the LINE in-app browser. Friendly states for expired, already-signed, and revoked links.

**Bookkeeper:** one list of receipts with the slip beside each, the automatic checks that passed or failed, and approve / needs-fix / flag with a note.

Follow the existing shadcn/ui patterns and the card-based style of the portal.

## 11. Phases

**Phase 1: Foundations.** Read the codebase and report your understanding and any conflicts. Migrations, RLS, audit events, config, counter with locking, and tests including concurrent number issuance.
*Acceptance:* two simultaneous finalizations never produce a duplicate or a gap; RLS tests pass per role.

**Phase 2: Client flow.** Create transaction, slip checks, link generation and copy, list and detail pages.
*Acceptance:* a duplicate slip reference is rejected; a WHT mismatch is flagged.

**Phase 3: Vendor flow, issuing, and review.** Token-gated vendor page, signature, LINE verification, authorization record, finalization, PDF generation, Thai-words utility, client print/download, void and replace, the simple bookkeeper list, and the QR verification page.
*Acceptance:* end to end from creating a transaction to a printable PDF; expired and reused links behave correctly; a voided receipt keeps its number and points to its replacement.

## 12. Pilot operations

- Add a documented, runnable **weekly export script** for the database and the storage files, written so it can be run manually, because free-tier backups may not exist. Document how to restore.
- Add a simple **pilot metrics** view for me: transactions created, links opened, signed, expired, and the median time from link creation to signing.
- Seed script with fake data for demos and tests. Never use real personal data in tests.

## 13. Not in the pilot (do not build)

Cash payments, SMS OTP, push notifications or reminders, bulk CSV upload, multi-client series, a cross-tenant review queue, standing authorizations, automated slip verification, ID card image upload, tax invoice issuing, vendor accounts or login, payment initiation, and bank-statement matching.

## 14. Definition of done for every phase

Tests pass; migrations are reversible; no secrets or personal data in logs; UI tested on a small phone screen and inside the LINE browser; `[VERIFY]` and `[DECISION]` items are listed; and a short written report is delivered before moving on.
