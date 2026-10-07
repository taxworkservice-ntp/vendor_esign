import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { sha256hex } from './auth'
import { applyWhtThreshold, calcWht } from '../../src/lib/wht-calc'
import { getTenantSettings } from './settings'
import { itemsSummary, itemsTotal, normalizeLineItem } from '../../src/lib/line-items'
import { emptyTotals, type TxnTotals } from '../../src/lib/txn-filters'
import { parseListQuery } from '../../src/lib/txn-list-query'
import { limitClause, orderByClause, totalsClause, whereClause } from './txn-sql'
import { readStoredDurable } from './storage'
import { decryptId } from './crypto'
import { isoDay } from './dates'
import { audit, one } from './shared'
import { contentDisposition, documentFileName } from '../../src/lib/download-name'
import type { PaymentTransaction } from '../../src/lib/types'

// ── Client transactions API ───────────────────────────────────────────────
// Session-guarded, workspace-scoped (RLS via withTenant). Mirrors the mock
// store so useTransactions can run server-side when VITE_API_BASE is set.

export const txnRoutes = new Hono()

const norm = (s: string) => s.replace(/\D/g, '').slice(0, 13)
const maskFromLast4 = (last4: string) =>
  last4.length === 4 ? `x-xxxx-xxxxx-${last4.slice(0, 2)}-${last4.slice(-2)}` : 'x-xxxx-xxxxx-••-•'

const SELECT = `
  select p.id, p.user_id, p.ref, p.vendor_id, p.payment_type, p.description, p.note, p.line_items,
    p.gross_amount, p.wht_rate, p.wht_mode, p.wht_amount, p.net_amount, p.transfer_date,
    p.slip_reference, p.slip_file_path, p.status, p.void_reason, p.tax_id_last4, p.created_at,
    v.name as vendor_name, v.address as vendor_address, v.prefix as vendor_prefix, v.vendor_no as vendor_no,
    v.id_number_encrypted as vendor_id_encrypted,
    (select row_to_json(x) from (
       select number, issue_date, verification_code, voided_at from vendor_receipts rr where rr.transaction_id = p.id
       order by rr.issue_date desc limit 1) x) as receipt,
    (select row_to_json(x) from (
       select token, created_at, opened_at, used_at, revoked_at, expires_at
       from vendor_requests vr where vr.transaction_id = p.id
       order by vr.created_at desc limit 1) x) as req,
    (select row_to_json(x) from (
       select min(created_at) as sent_at, min(opened_at) as opened_at, max(expires_at) as expires_at
       from vendor_requests vr where vr.transaction_id = p.id) x) as life
  from vendor_payables p
  join vendor_payees v on v.id = p.vendor_id`

interface Sub {
  [k: string]: unknown
}

const iso = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = v instanceof Date ? v.toISOString() : String(v)
  return s || undefined
}

const sub = (v: unknown): Sub | null => (v && typeof v === 'object' ? (v as Sub) : null)

/**
 * Timeline labels. These strings are a contract: src/lib/receipt.ts derives the
 * pilot metrics (links opened, median time to sign) by matching on them, so
 * they must stay identical to the ones the mock store writes.
 */
const EV = {
  created: 'สร้างรายการ',
  sent: 'ส่งลิงก์ให้ผู้ขาย',
  opened: 'ผู้ขายเปิดลิงก์',
  signed: 'ผู้ขายลงนามรับเงินและมอบอำนาจ',
  issued: 'ออกใบเสร็จ',
  revoked: 'เพิกถอนลิงก์',
  voided: 'ยกเลิกเอกสาร',
} as const

/**
 * Rebuilds the event history from the request/receipt timestamps. The list
 * endpoint used to return `timeline: []`, which left the detail page's history
 * blank and silently zeroed the metrics that read those labels.
 */
function buildTimeline(r: Record<string, unknown>, receiptNumber: string | undefined): PaymentTransaction['timeline'] {
  const req = sub(r.req)
  const receipt = sub(r.receipt)
  const out: PaymentTransaction['timeline'] = []

  const push = (at: string | undefined, label: string, detail?: string) => {
    if (at) out.push(detail ? { at, label, detail } : { at, label })
  }

  push(iso(r.created_at), EV.created, 'ธุรกรรมฉบับร่าง')
  push(iso(req?.created_at), EV.sent, 'คัดลอกลิงก์ทาง LINE')
  push(iso(req?.opened_at), EV.opened)
  push(iso(req?.used_at), EV.signed)
  push(iso(receipt?.issue_date) ?? (receiptNumber ? iso(r.created_at) : undefined), EV.issued, receiptNumber)
  push(iso(req?.revoked_at), EV.revoked)
  // The void is stamped with the receipt's voided_at (the real moment), not the
  // transaction's created_at — otherwise the history shows the cancellation on
  // the day the document was drafted.
  if (r.void_reason) push(iso(receipt?.voided_at) ?? iso(r.created_at), EV.voided, String(r.void_reason))

  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

// Exported for tests: the row mapper owns the timeline labels that
// src/lib/receipt.ts (metrics) depends on, so it needs direct coverage.
export function toTxn(r: Record<string, unknown>): PaymentTransaction {
  const items = Array.isArray(r.line_items)
    ? (r.line_items as Record<string, unknown>[]).map((it) => normalizeLineItem(it as never))
    : []
  const last4 = String(r.tax_id_last4 ?? '')
  const receipt = sub(r.receipt)
  const receiptNumber = receipt ? (String(receipt.number ?? '') || undefined) : undefined
  const verificationCode = receipt ? (String(receipt.verification_code ?? '') || undefined) : undefined
  const receiptIssueDate = receipt ? isoDay(receipt.issue_date) : undefined
  // Only a live, unspent, unexpired link can actually be opened by the vendor.
  const req = sub(r.req)
  const live = req ? new Date(String(req.expires_at ?? 0)) > new Date() : false
  const inviteToken = req && !req.used_at && !req.revoked_at && live ? String(req.token ?? '') || undefined : undefined
  const life = sub(r.life)
  // The client owns this data — the portal shows the full tax ID, not the mask.
  let vendorTaxId: string | undefined
  const encVendor = r.vendor_id_encrypted as string | null
  if (encVendor) {
    try { vendorTaxId = decryptId(encVendor) ?? undefined } catch { vendorTaxId = undefined }
  }

  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    vendor: {
      id: String(r.vendor_id),
      vendorNo: Number(r.vendor_no ?? 0),
      prefix: String(r.vendor_prefix ?? ''),
      name: String(r.vendor_name ?? ''),
      address: String(r.vendor_address ?? ''),
      taxId: vendorTaxId,
      maskedId: maskFromLast4(last4),
    },
    paymentType: String(r.payment_type ?? ''),
    description: String(r.description ?? ''),
    note: String(r.note ?? ''),
    lineItems: items,
    grossAmount: Number(r.gross_amount ?? 0),
    whtRate: Number(r.wht_rate ?? 0),
    whtMode: r.wht_mode === 'grossup' ? 'grossup' : 'deduct',
    whtAmount: Number(r.wht_amount ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    transferDate: isoDay(r.transfer_date),
    slipReference: String(r.slip_reference ?? ''),
    slipName: String(r.slip_file_path ?? ''),
    status: (r.status as PaymentTransaction['status']) ?? 'draft',
    receiptNumber,
    verificationCode,
    receiptIssueDate,
    inviteToken,
    voidReason: (r.void_reason as string | null) ?? undefined,
    taxIdLast4: last4 || undefined,
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
    // Invite lifecycle, so the list can age a row without loading a detail.
    sentAt: iso(life?.sent_at),
    openedAt: iso(life?.opened_at),
    expiresAt: iso(life?.expires_at),
    timeline: buildTimeline(r, receiptNumber),
    checks: [],
  }
}

function toTotals(r: Record<string, unknown>): TxnTotals {
  return {
    count: Number(r.count ?? 0),
    gross: Number(r.gross ?? 0),
    wht: Number(r.wht ?? 0),
    net: Number(r.net ?? 0),
    payableCount: Number(r.payable_count ?? 0),
    payableGross: Number(r.payable_gross ?? 0),
    payableWht: Number(r.payable_wht ?? 0),
    payableNet: Number(r.payable_net ?? 0),
    voidedCount: Number(r.voided_count ?? 0),
  }
}

/**
 * Paged, filtered, sorted list plus totals over the whole filtered set.
 *
 * The query is parsed by the shared validator (src/lib/txn-list-query.ts), so a
 * hand-edited URL cannot widen the scan, and compiled by a whitelisted builder
 * (txn-sql.ts). `limit=0` returns the full set for CSV export.
 */
txnRoutes.get('/transactions', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const query = parseListQuery(new URLSearchParams(c.req.query()))
  const where = whereClause(query, g.ws)
  const totals = totalsClause(query, g.ws)

  const result = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const limit = limitClause(query)
    // Two round trips, not N+1: one page of rows, one aggregate.
    const [rows, sumRows] = await Promise.all([
      db.query(`${SELECT}\n  where ${where.text}\n  ${orderByClause(query.sort)}\n  ${limit}`, where.params as never[]),
      db.query(totals.text, totals.params as never[]),
    ])
    return {
      transactions: (rows as unknown as Record<string, unknown>[]).map(toTxn),
      totals: (sumRows as unknown as Record<string, unknown>[])[0]
        ? toTotals((sumRows as unknown as Record<string, unknown>[])[0])
        : emptyTotals(),
    }
  })

  return c.json({
    transactions: result.transactions,
    // `total` is the plain row count for callers that only need paging maths.
    total: result.totals.count,
    totals: result.totals,
  })
})

// Distinct months that actually contain transactions, for the period bar.
// Registered before /transactions/:id so it is not swallowed by that route.
txnRoutes.get('/transactions/months', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db.query(
      `select distinct to_char(transfer_date, 'YYYY-MM') as month
       from vendor_payables where user_id = $1 and transfer_date is not null
       order by 1 desc`,
      [g.ws],
    )) as unknown as { month: string }[]
  })
  return c.json({ months: rows.map((r) => String(r.month)) })
})

// Slip references already in use, for duplicate detection while creating.
// Only the references — never the rows.
txnRoutes.get('/transactions/slips', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db.query(
      `select slip_reference from vendor_payables
       where user_id = $1 and slip_reference <> ''`,
      [g.ws],
    )) as unknown as { slip_reference: string }[]
  })
  return c.json({ refs: rows.map((r) => r.slip_reference) })
})

// The vendor's signed authorization for a transaction: the snapshot of who
// signed (name/address/prefix as the VENDOR confirmed them), the signature
// image, and any correction the vendor made to the client's records.
//
// This is what the client's receipt view needs and previously had no way to
// get: the signature PNG is written to private storage at signing time and was
// only ever read inside finalize, so the accountant's copy silently rendered an
// empty signature. It also fixes a divergence — finalize builds the issued PDF
// from vendor_authorizations, while the client's sheet used its own
// vendor_payees row, so the two documents could show different spellings.
//
// Access is plain guard() + tenant scope: the portal has no bookkeeper role (see
// docs/API.md "Roles and tenancy"), and the external bookkeeper who receives
// the PDF is not a user of this app.
txnRoutes.get('/transactions/:id/authorization', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const id = c.req.param('id')
  const rows = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    return (await db.query(
      `select a.vendor_prefix, a.vendor_name, a.vendor_address, a.vendor_masked_id,
         a.vendor_phone, a.vendor_email, a.auth_ref, a.line_user_id,
         a.signature_image_path, a.signed_at, a.verification_method, a.consent_text_version,
         a.ip, a.user_agent,
         p.status as txn_status, p.void_reason,
         req.opened_at, req.unlocked_at,
         v.prefix as client_prefix, v.name as client_name, v.address as client_address
       from vendor_authorizations a
       join vendor_payables p on p.id = a.transaction_id and p.user_id = a.user_id
       join vendor_payees v on v.id = p.vendor_id
       left join lateral (
         select opened_at, unlocked_at from vendor_requests vr
         where vr.transaction_id = a.transaction_id and vr.user_id = a.user_id
         order by vr.used_at desc nulls last, vr.created_at desc limit 1
       ) req on true
       where a.transaction_id = $1 and a.user_id = $2`,
      [id, g.ws],
    )) as unknown as Record<string, unknown>[]
  })
  const a = rows[0]
  if (!a) return c.json({ error: 'not-signed' }, 404)

  // Diff the authorized snapshot against what the client had on file. Stored
  // nowhere, so this is the only place a vendor's correction is ever visible.
  const corrections: { field: string; from: string; to: string }[] = []
  const diff = (field: string, from: unknown, to: unknown) => {
    if (String(from ?? '') !== String(to ?? '')) {
      corrections.push({ field, from: String(from ?? ''), to: String(to ?? '') })
    }
  }
  diff('prefix', a.client_prefix, a.vendor_prefix)
  diff('name', a.client_name, a.vendor_name)
  diff('address', a.client_address, a.vendor_address)

  // The image is optional: a row can be authorized with an unreadable file, and
  // the client must be able to tell "not signed" from "signed, image missing".
  const sig = await readStoredDurable(g.ws, a.signature_image_path as string)

  return c.json({
    signedAt: iso(a.signed_at),
    verificationMethod: String(a.verification_method ?? ''),
    consentVersion: String(a.consent_text_version ?? ''),
    vendorPrefix: String(a.vendor_prefix ?? ''),
    vendorName: String(a.vendor_name ?? ''),
    vendorAddress: String(a.vendor_address ?? ''),
    vendorPhone: String(a.vendor_phone ?? ''),
    vendorEmail: String(a.vendor_email ?? ''),
    authRef: String(a.auth_ref ?? ''),
    maskedId: String(a.vendor_masked_id ?? ''),
    // Signing trail (already stored) — surfaced so the client can show the
    // vendor the record of when/where/how they signed.
    ip: a.ip ? String(a.ip) : undefined,
    userAgent: a.user_agent ? String(a.user_agent) : undefined,
    lineUserId: a.line_user_id ? String(a.line_user_id) : undefined,
    openedAt: iso(a.opened_at),
    unlockedAt: iso(a.unlocked_at),
    status: String(a.txn_status ?? ''),
    voidReason: a.void_reason ? String(a.void_reason) : undefined,
    corrections,
    signaturePng: sig ? `data:image/png;base64,${Buffer.from(sig).toString('base64')}` : null,
  })
})

// The issued receipt PDF — the statutory artifact. Built by finalize, which
// embeds the vendor signature and records pdf_sha256; this just serves it back.
// Until now nothing read the file, so the only download available to the
// accountant was an unsigned html2canvas snapshot of the screen.
txnRoutes.get('/transactions/:id/receipt.pdf', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    // Join the payable so the filename can carry the vendor (title-stripped)
    // and the gross base, matching the client's preview download exactly.
    return (await db.query(
      `select r.number, r.verification_code, r.pdf_path, r.pdf_sha256,
              p.gross_amount, v.name as vendor_name
       from vendor_receipts r
       join vendor_payables p on p.id = r.transaction_id and p.user_id = r.user_id
       join vendor_payees v on v.id = p.vendor_id
       where r.transaction_id = $1 and r.user_id = $2`,
      [c.req.param('id'), g.ws],
    )) as unknown as Record<string, unknown>[]
  })
  const r = rows[0]
  if (!r) return c.json({ error: 'not-issued' }, 404)
  const bytes = await readStoredDurable(g.ws, r.pdf_path as string)
  if (!bytes) return c.json({ error: 'pdf-unavailable' }, 404)

  const number = String(r.number ?? 'receipt')
  const filename = documentFileName({
    number,
    vendorName: String(r.vendor_name ?? ''),
    amount: Number(r.gross_amount),
  })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // Dual header: filename* carries the Thai name, filename= is the fallback.
      'Content-Disposition': contentDisposition(filename),
      'Content-Length': String(bytes.byteLength),
      // Surfaced so the client can show what it is handing over, and so the
      // file can be checked against the value recorded at issuance.
      'X-Pdf-Sha256': String(r.pdf_sha256 ?? ''),
      'X-Verification-Code': String(r.verification_code ?? ''),
      'Cache-Control': 'private, no-store',
    },
  })
})

txnRoutes.get('/transactions/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db.query(`${SELECT} where p.id = $1 and p.user_id = $2`, [c.req.param('id'), g.ws])) as unknown as Record<string, unknown>[]
  })
  if (!rows[0]) return c.json({ error: 'not-found' }, 404)
  return c.json({ transaction: toTxn(rows[0]) })
})

txnRoutes.post('/transactions', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { vendorId?: string; paymentType?: string; note?: string; lineItems?: unknown; whtRate?: number; whtMode?: string; forceWht?: boolean; transferDate?: string; slipReference?: string; slipName?: string; vendorTaxId?: string }
    | null
  const items = (Array.isArray(b?.lineItems) ? b!.lineItems : [])
    .map((it) => normalizeLineItem(it as never))
    .filter((it) => it.description && it.amount > 0)
  if (!b?.vendorId || items.length === 0) return c.json({ error: 'invalid-body' }, 400)
  const whtMode = b.whtMode === 'grossup' ? 'grossup' : 'deduct'
  const base = itemsTotal(items)
  // มาตรา 50/1 — server is authoritative: re-derive the effective rate/type
  // from the tenant threshold rather than trusting the submitted values.
  const settings = await getTenantSettings(g.ws)
  const eff = applyWhtThreshold(
    base,
    Number(b.whtRate) || 0,
    b.paymentType ?? 'ค่าบริการ',
    settings.whtMinThreshold,
    !!b.forceWht,
  )
  const { gross, wht, net } = calcWht(base, eff.rate, whtMode)
  const note = (b.note ?? '').trim()
  const taxId = norm(b.vendorTaxId ?? '')
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`
      insert into vendor_payables (user_id, ref, vendor_id, payment_type, description, note, line_items,
        gross_amount, wht_rate, wht_mode, wht_amount, net_amount, transfer_date, slip_reference, status,
        tax_id_hash, tax_id_last4, created_by)
      values (${g.ws}, ${`TX-${Date.now().toString(36)}`}, ${b!.vendorId}, ${eff.paymentType},
        ${itemsSummary(items, note)}, ${note}, ${JSON.stringify(items)}::jsonb,
        ${gross}, ${eff.rate}, ${whtMode}, ${wht}, ${net},
        ${b!.transferDate ?? new Date().toISOString().slice(0, 10)}, ${b!.slipReference ?? ''}, 'draft',
        ${taxId ? sha256hex(taxId) : null}, ${taxId.slice(-4) || null}, ${g.u?.email ?? g.actor ?? 'system'})
      returning id`) as unknown as { id: string }[]
    return ins[0]
  })
  return c.json({ ok: true, id: String(row.id) })
})

txnRoutes.post('/transactions/:id/send', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const id = c.req.param('id')
  const token = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    // Reuse the active link so "resend" keeps the same URL until the vendor
    // signs (used_at) or it expires; only mint a new one when none is active.
    const existing = (await db`select token from vendor_requests
      where transaction_id = ${id} and user_id = ${g.ws}
        and used_at is null and revoked_at is null and expires_at > now()
      order by created_at desc limit 1`) as unknown as { token: string }[]
    let tok = existing[0]?.token
    if (!tok) {
      tok = randomBytes(32).toString('base64url')
      await db`insert into vendor_requests (user_id, transaction_id, token_hash, token, expires_at)
        values (${g.ws}, ${id}, ${sha256hex(tok)}, ${tok}, now() + interval '7 days')`
    }
    // Re-activate anything not yet signed (draft, expired, cancelled) so a
    // re-sent link can be opened again; sent/opened keep their status (resend).
    await db`update vendor_payables set status = 'sent'
      where id = ${id} and user_id = ${g.ws} and status in ('draft', 'expired', 'cancelled')`
    return tok
  })
  return c.json({ ok: true, token })
})

txnRoutes.post('/transactions/:id/revoke', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const id = c.req.param('id')
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update vendor_requests set revoked_at = now()
      where transaction_id = ${id} and user_id = ${g.ws} and used_at is null`
    await db`update vendor_payables set status = 'cancelled' where id = ${id} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})

txnRoutes.post('/transactions/:id/void', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { reason?: string } | null
  const reason = (b?.reason ?? '').trim()
  if (!reason) return c.json({ error: 'reason-required' }, 400)
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const res = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const cur = one<{ status: string }>(
      await db`select status from vendor_payables where id = ${id} and user_id = ${g.ws}`,
    )
    if (!cur) return { ok: false as const, error: 'not-found' as const }
    // A repeat void is a no-op, not a second effect.
    if (cur.status === 'void') return { ok: true as const }
    await db`update vendor_payables set status = 'void', void_reason = ${reason}, updated_at = now()
      where id = ${id} and user_id = ${g.ws}`
    // The issued receipt is an artifact: keep the row and its number, but mirror
    // the void so the register, exports and public verification all agree it is
    // no longer a live document. (Once `vendor_receipts.status` is synced, the
    // register's `r.status = 'issued'` filter drops it from totals.)
    await db`update vendor_receipts set status = 'void', void_reason = ${reason}, voided_at = now()
      where transaction_id = ${id} and user_id = ${g.ws}`
    // Cancel any still-live vendor link so the document cannot be opened.
    await db`update vendor_requests set revoked_at = now()
      where transaction_id = ${id} and user_id = ${g.ws} and used_at is null and revoked_at is null`
    // The auto-created withholding certificate is no longer valid: void it if it
    // is unfiled, mark it superseded if it was already filed (keep the record).
    await db`update wht_records set status = case when status = 'done' then 'superseded' else 'void' end
      where source_transaction_id = ${id} and user_id = ${g.ws} and status in ('active','done')`
    await audit(g.ws, 'vendor_receipts', id, 'receipt.voided', g.actor, { reason }, ip)
    return { ok: true as const }
  })
  if (!res.ok) return c.json({ error: res.error }, 404)
  return c.json({ ok: true })
})

// Slip is optional at creation — attach/replace it later. Reference uniqueness
// is enforced client-side (case/space-insensitive) to mirror the create rule.
txnRoutes.post('/transactions/:id/slip', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { slipReference?: string; slipName?: string } | null
  const id = c.req.param('id')
  const ref = (b?.slipReference ?? '').trim()
  const name = (b?.slipName ?? '').trim()
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update vendor_payables set slip_reference = ${ref}, slip_file_path = ${name}
      where id = ${id} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})
