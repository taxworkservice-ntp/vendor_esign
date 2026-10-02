import { Hono } from 'hono'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql, withTenant } from '../../src/server/db'
import { amountToThaiWords } from '../../src/lib/thai-words'
import { isVendorPrefix, prefixRequired, isEntityName, vendorDisplayName } from '../../src/lib/vendor-name'
import { currentBeYear } from '../../src/lib/settings-types'
import { formTypeForVendorType } from '../../src/lib/wht'
import { decryptId } from './crypto'
import { saveBytes } from './storage'
import { buildReceiptPdf } from './pdf'
import { sha256hex, sessionUser } from './auth'
import { getVendorMemory } from './vendor-memory'
import { authRoutes, requireClient } from './client-auth'
import { corsMw } from './cors'
import { getTenantSettings, saveTenantSettings } from './settings'
import { r2Configured, signDownload, signUpload } from './r2-storage'
import { dataRoutes } from './data'
import { txnRoutes } from './transactions'
import { whtRoutes } from './wht'
import {
  CLIENT_DISPLAY,
  PILOT_BE_YEAR,
  PILOT_TENANT,
  PUBLIC_BASE,
  audit,
  one,
  rateLimited,
  tenantProfile,
} from './shared'

// ── Public client/vendor operation ─────────────────────────────────────
// Vendor links, signing, finalize, QR verify. No login, no admin routes.
// Admin lives in the isolated operation (server/src/admin.ts, ADMIN_PORT).
// Secrets only via env. Never log tokens, ID numbers, or personal data.

const TENANT = PILOT_TENANT
const BE_YEAR = PILOT_BE_YEAR

// Gate attempts: 5 wrong IDs per token per 10 min (single process;
// move to Postgres behind multiple replicas — same caveat as rate limits).
const GATE_MAX = 5
const gateFails = new Map<string, { n: number; until: number }>()
function gateBlocked(tokenHash: string): boolean {
  const f = gateFails.get(tokenHash)
  if (!f) return false
  if (Date.now() > f.until) {
    gateFails.delete(tokenHash)
    return false
  }
  return f.n >= GATE_MAX
}
function gateFail(tokenHash: string): number {
  const f = gateFails.get(tokenHash) ?? { n: 0, until: Date.now() + 10 * 60 * 1000 }
  f.n += 1
  gateFails.set(tokenHash, f)
  return Math.max(0, GATE_MAX - f.n)
}

export const app = new Hono()

app.use('*', corsMw())

// Client portal auth (login/logout/me/change-password).
app.route('/api/auth', authRoutes)

// Client portal data (vendors + items) — session-guarded, workspace-scoped.
app.route('/api/client', dataRoutes)

// Client transactions (list/get/create/send/revoke/void).
app.route('/api/client', txnRoutes)

// Client WHT records + vendors.
app.route('/api/client', whtRoutes)

app.get('/api/health', (c) => c.json({ ok: true, operation: 'public', tenant: TENANT }))

// Vendor: load own transaction (masked). First open stamps opened_at.
// Multi-tenant: token_hash is globally unique — tenant is derived from the row,
// never from a hardcoded constant, so one deploy serves all clients.
app.get('/api/vendor/:token', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`get:${ip}`)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const db = sql()
  const rows = await db`
    select vr.id as req_id, vr.user_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.ref, t.description, t.payment_type, t.gross_amount, t.wht_rate,
      t.wht_amount, t.net_amount, t.transfer_date, t.slip_reference, t.status,
      t.tax_id_hash, t.tax_id_last4,
      v.prefix as vendor_prefix, v.name as vendor_name, v.address as vendor_address
    from vendor_requests vr
    join vendor_payables t on t.id = vr.transaction_id
    join vendor_payees v on v.id = t.vendor_id
    where vr.token_hash = ${sha256hex(token)}`
  const r = one<Record<string, unknown>>(rows)
  if (!r) return c.json({ error: 'invalid-or-expired' }, 404)
  if (r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  const rowTenant = String(r.user_id)
  if (r.status === 'sent') {
    await db`update vendor_requests set opened_at = coalesce(opened_at, now()) where id = ${String(r.req_id)}`;
    await db`update vendor_payables set status = 'opened' where id = ${String(r.id)} and status = 'sent'`;
    await withTenant(rowTenant, 'client', async () =>
      audit(rowTenant, 'vendor_payables', String(r.id), 'vendor.opened', 'vendor', {}, ip))
  }
  return c.json({
    ref: r.ref, description: r.description, paymentType: r.payment_type,
    grossAmount: r.gross_amount, whtRate: r.wht_rate, whtAmount: r.wht_amount,
    netAmount: r.net_amount, transferDate: r.transfer_date,
    slipReference: r.slip_reference, status: r.status,
    // Gate + confirm-and-sign prefill (name/address are not secret).
    gated: (r as Record<string, unknown>).tax_id_hash != null,
    idLast4: (r as Record<string, unknown>).tax_id_last4 ?? null,
    vendorPrefix: r.vendor_prefix, vendorName: r.vendor_name, vendorAddress: r.vendor_address,
    unlocked: (r as Record<string, unknown>).unlocked_at != null,
  })
})

// Tax ID gate: proves the opener is the intended vendor before ANY
// document content is revealed. Legacy rows without tax_id_hash skip it.
app.post('/api/vendor/:token/unlock', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`unlock:${ip}`, 10)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const th = sha256hex(token)
  if (gateBlocked(th)) return c.json({ error: 'gate-locked', remaining: 0 }, 429)
  const body = await c.req.json().catch(() => null) as { idNumber?: string } | null
  const idNumber = (body?.idNumber ?? '').replace(/\D/g, '')
  if (!/^\d{13}$/.test(idNumber)) return c.json({ error: 'invalid-body' }, 400)

  const db = sql()
  const rows = await db`
    select vr.id as req_id, vr.user_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.status, t.tax_id_hash, t.tax_id_last4,
      v.prefix as vendor_prefix, v.name as vendor_name, v.address as vendor_address
    from vendor_requests vr
    join vendor_payables t on t.id = vr.transaction_id
    join vendor_payees v on v.id = t.vendor_id
    where vr.token_hash = ${th}`
  const r = one<Record<string, unknown>>(rows)
  if (!r || r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  const rowTenant = String(r.user_id)
  if (!r.tax_id_hash) {
    // Legacy row: no gate — mark unlocked so sign can proceed.
    await db`update vendor_requests set unlocked_at = coalesce(unlocked_at, now()) where id = ${String(r.req_id)}`
    return c.json({ ok: true, legacy: true, vendorPrefix: r.vendor_prefix, vendorName: r.vendor_name, vendorAddress: r.vendor_address })
  }
  const a = Buffer.from(sha256hex(idNumber), 'hex')
  const b = Buffer.from(String(r.tax_id_hash), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const remaining = gateFail(th)
    await withTenant(rowTenant, 'client', async () =>
      audit(rowTenant, 'vendor_requests', String(r.req_id), 'vendor.gate-failed', 'vendor', { remaining }, ip))
    return c.json(
      remaining <= 0 ? { error: 'gate-locked', remaining: 0 } : { error: 'wrong-id', remaining },
      remaining <= 0 ? 429 : 401,
    )
  }
  gateFails.delete(th)
  await db`update vendor_requests set unlocked_at = now() where id = ${String(r.req_id)}`
  await withTenant(rowTenant, 'client', async () =>
    audit(rowTenant, 'vendor_requests', String(r.req_id), 'vendor.unlocked', 'vendor', {}, ip))
  // Prefill for confirm-and-sign: vendor confirms instead of retyping.
  return c.json({ ok: true, vendorPrefix: r.vendor_prefix, vendorName: r.vendor_name, vendorAddress: r.vendor_address, idLast4: r.tax_id_last4 })
})

// Vendor: sign. Single-use — consumes the token. Verification is
// 'stub-deferred' until the LINE step (see docs/LINE.md insertion points).
app.post('/api/vendor/:token/sign', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`sign:${ip}`, 10)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const body = await c.req.json().catch(() => null) as {
    vendorPrefix?: string; vendorName?: string; vendorAddress?: string; idNumberEncrypted?: string;
    idLast4?: string; signaturePng?: string; consentVersion?: string; lineUserId?: string;
  } | null
  if (!body?.vendorName || !body?.vendorAddress || !body?.signaturePng || body.consentVersion !== 'v1')
    return c.json({ error: 'invalid-body' }, 400)
  const subPrefix = (body.vendorPrefix ?? '').trim()
  if (prefixRequired(String(body.vendorName)) && !isVendorPrefix(subPrefix))
    return c.json({ error: 'invalid-prefix' }, 400)
  // idLast4 is printed on the receipt in masked form (x-xxxx-xxxxx-AB-C) per
  // spec; the full ID travels/stays encrypted via idNumberEncrypted only.
  const last4 = (body.idLast4 ?? '').replace(/\D/g, '').slice(-4)
  if (last4.length !== 4) return c.json({ error: 'invalid-body' }, 400)

  const db = sql()
  const png = Buffer.from(
    String(body.signaturePng).replace(/^data:image\/png;base64,/, ''), 'base64')
  if (png.length < 100 || png.length > 2_000_000)
    return c.json({ error: 'invalid-signature' }, 400)

  const rows = await db`
    select vr.id as req_id, vr.user_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.status, t.net_amount, t.tax_id_hash,
      v.prefix as record_prefix, v.name as record_name, v.address as record_address
    from vendor_requests vr
    join vendor_payables t on t.id = vr.transaction_id
    join vendor_payees v on v.id = t.vendor_id
    where vr.token_hash = ${sha256hex(token)}`
  const r = one<Record<string, unknown>>(rows)
  if (!r || r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  // Gate cannot be bypassed by direct POST: gated rows need unlocked_at.
  if (r.tax_id_hash && !r.unlocked_at) return c.json({ error: 'not-unlocked' }, 403)
  if (!['sent', 'opened'].includes(String(r.status)))
    return c.json({ error: 'already-signed' }, 409)

  const txnId = String(r.id)
  const rowTenant = String(r.user_id)
  // Corrections: diff submitted info against client records server-side,
  // stored on the authorization and reported back to the client.
  const corrections: { field: string; from: string; to: string }[] = []
  const subName = String(body.vendorName).slice(0, 200)
  const subAddr = String(body.vendorAddress).slice(0, 500)
  if (subPrefix !== String(r.record_prefix ?? ''))
    corrections.push({ field: 'prefix', from: String(r.record_prefix ?? ''), to: subPrefix })
  if (subName !== String(r.record_name))
    corrections.push({ field: 'name', from: String(r.record_name), to: subName })
  if (subAddr !== String(r.record_address))
    corrections.push({ field: 'address', from: String(r.record_address), to: subAddr })
  const sigPath = saveBytes('signatures', `${txnId}.png`, png, rowTenant)
  await db`insert into vendor_authorizations
    (user_id, transaction_id, vendor_prefix, vendor_name, vendor_address, vendor_masked_id,
     signature_image_path, verification_method, line_user_id, ip, user_agent,
     consent_text_version, corrections)
    values (${rowTenant}, ${txnId}, ${subPrefix}, ${subName}, ${subAddr},
      ${`x-xxxx-xxxxx-${last4.slice(0, 2)}-${last4.slice(2)}`},
      ${sigPath}, 'stub-deferred', ${body.lineUserId ?? null}, ${ip},
      ${(c.req.header('user-agent') ?? '').slice(0, 500)}, 'v1',
      ${JSON.stringify(corrections)})`
  await db`update vendor_requests set used_at = now() where id = ${String(r.req_id)}`
  await db`update vendor_payables set status = 'signed' where id = ${txnId}`
  await withTenant(rowTenant, 'client', async () =>
    audit(rowTenant, 'vendor_payables', txnId, 'vendor.signed', 'vendor',
      { verificationMethod: 'stub-deferred', consentVersion: 'v1', corrections }, ip))
  return c.json({ ok: true, transactionId: txnId, corrections })
})

// Finalize: assign series number + receipt row + PDF in one flow.
// Number is issued inside the same DB txn as the receipt insert
// (generate_doc_number locks the counter row). PDF failure after numbering
// retries with the SAME number — never gaps, never MAX()+1.
// Multi-tenant: tenant + prefix + be_year come from the tenants row.
app.post('/api/transactions/:id/finalize', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const txnId = c.req.param('id')
  const db = sql()

  const txnRows = (await db`select user_id from vendor_payables where id = ${txnId}`) as unknown as
    { user_id: string }[]
  const rowTenant = txnRows[0] ? String(txnRows[0].user_id) : TENANT
  const prof = (await tenantProfile(rowTenant)) ?? { code: rowTenant, beYear: BE_YEAR, display: CLIENT_DISPLAY }

  const existing = await db`
    select r.number, r.verification_code, r.pdf_path from vendor_receipts r
    where r.transaction_id = ${txnId} and r.user_id = ${rowTenant}`
  const ex = one<Record<string, unknown>>(existing)
  if (ex?.pdf_path) return c.json({ error: 'already-issued' }, 409)

  let number: string
  let code: string
  if (ex) {
    number = String(ex.number)
    code = String(ex.verification_code)
  } else {
    const auth = await db`select vendor_name, vendor_address from vendor_authorizations
      where transaction_id = ${txnId} and user_id = ${rowTenant}`
    if (!one(auth)) return c.json({ error: 'not-signed' }, 422)
    code = randomBytes(6).toString('hex')
    // RCT-{VENDORNO}-{BE_YEAR}-{NNN} via generate_doc_number(user_id, doc_type, year, vendor_no)
    const vno = one<{ vendor_no: number }>(await db`
      select v.vendor_no from vendor_payables p
      join vendor_payees v on v.id = p.vendor_id
      where p.id = ${txnId} and p.user_id = ${rowTenant}`)
    const n = await db`select generate_doc_number(${rowTenant}, 'vendor_receipt', ${currentBeYear()}, ${Number(vno?.vendor_no ?? 0)}) as number`
    number = String(one<Record<string, unknown>>(n)?.number)
    await db`insert into vendor_receipts (user_id, transaction_id, number, issue_date, verification_code, status)
      values (${rowTenant}, ${txnId}, ${number}, CURRENT_DATE, ${code}, 'issued')`
    await db`update vendor_payables set status = 'issued' where id = ${txnId}`
    await withTenant(rowTenant, 'client', async () =>
      audit(rowTenant, 'vendor_receipts', txnId, 'receipt.issued', 'system', { number }, ip))
  }

  const rows = await db`
    select t.description, t.note, t.payment_type, t.line_items, t.gross_amount, t.wht_rate, t.wht_amount, t.net_amount,
      t.transfer_date, t.slip_reference,
      a.vendor_prefix, a.vendor_name, a.vendor_address, a.vendor_masked_id, a.signature_image_path,
      a.signed_at, a.verification_method, a.consent_text_version
    from vendor_payables t
    join vendor_authorizations a on a.transaction_id = t.id
    where t.id = ${txnId} and t.user_id = ${rowTenant}`
  const d = one<{
    description: string; note: string; payment_type: string | null; line_items: unknown;
    gross_amount: string; wht_rate: string; wht_amount: string;
    net_amount: string; transfer_date: string; slip_reference: string;
    vendor_prefix: string; vendor_name: string; vendor_address: string; vendor_masked_id: string;
    signature_image_path: string; signed_at: string;
    verification_method: string; consent_text_version: string;
  }>(rows)
  if (!d) return c.json({ error: 'not-signed' }, 422)

  // Auto-generate the withholding certificate on issuance (idempotent per txn).
  const whtAmountNum = Number(d.wht_amount)
  if (whtAmountNum > 0) {
    await withTenant(rowTenant, 'owner', async () => {
      const already = one<{ id: string }>(
        await db`select id from wht_records where user_id = ${rowTenant} and source_transaction_id = ${txnId}`,
      )
      if (already) return
      let taxId = ''
      try {
        const enc = one<{ id_number_encrypted: string | null }>(await db`
          select v.id_number_encrypted from vendor_payables p
          join vendor_payees v on v.id = p.vendor_id
          where p.id = ${txnId} and p.user_id = ${rowTenant}`)
        if (enc?.id_number_encrypted) taxId = decryptId(enc.id_number_encrypted) ?? ''
      } catch {
        /* key absent — certificate still issues without tax id */
      }
      const vName = vendorDisplayName(d.vendor_prefix, d.vendor_name)
      const vType: 'individual' | 'company' = isEntityName(d.vendor_name) ? 'company' : 'individual'
      const wv = one<{ id: string }>(await db`select id from wht_vendors
        where user_id = ${rowTenant} and ((${taxId} <> '' and tax_id = ${taxId}) or name = ${vName}) limit 1`)
      let vendorId = wv?.id
      if (!vendorId) {
        vendorId = String(
          one<{ id: string }>(await db`insert into wht_vendors (user_id, name, tax_id, address, vendor_type)
            values (${rowTenant}, ${vName}, ${taxId}, ${d.vendor_address}, ${vType}) returning id`)?.id,
        )
      }
      const issueDate = String(d.transfer_date).slice(0, 10)
      // The printed description is the payment type NAME (ประเภทการจ่าย), not
      // the transaction note and not a stored label — older labels carried a
      // rate suffix ("ค่าบริการ — 3%") which must not appear on the form.
      const whtDescription = d.payment_type || d.note || d.description
      await db`insert into wht_records
        (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, description, status, certificate_no, source_transaction_id)
        values (${rowTenant}, ${vendorId}, ${formTypeForVendorType(vType)}, ${issueDate}::date,
          ${Number(d.gross_amount)}, ${Number(d.wht_rate)}, ${whtAmountNum}, ${whtDescription}, 'active',
          generate_wht_certificate_no(${rowTenant}, ${issueDate}::date), ${txnId})`
    })
  }

  const rawItems = Array.isArray(d.line_items) ? (d.line_items as { description?: unknown; amount?: unknown }[]) : []
  const lineItems = rawItems
    .map((it) => ({ description: String(it.description ?? ''), amount: Number(it.amount) || 0 }))
    .filter((it) => it.description.trim() || it.amount > 0)
  let sig: Uint8Array | undefined
  try {
    sig = readFileSync(join(process.env.STORAGE_DIR ?? join(process.cwd(), 'storage'), d.signature_image_path))
  } catch {
    sig = undefined
  }
  const verifyUrl = `${PUBLIC_BASE}/verify/${code.toUpperCase()}`
  const { bytes, sha256 } = await buildReceiptPdf({
    number,
    issueDate: new Date().toISOString().slice(0, 10),
    verifyUrl,
    verificationCode: code.toUpperCase(),
    verificationMethod: d.verification_method,
    consentVersion: d.consent_text_version,
    signedAt: d.signed_at,
    client: { code: prof.code, display: prof.display },
    vendor: { prefix: d.vendor_prefix, name: d.vendor_name, address: d.vendor_address, maskedId: d.vendor_masked_id },
    lineItems,
    note: d.note,
    description: d.description,
    grossAmount: Number(d.gross_amount),
    whtRate: Number(d.wht_rate),
    whtAmount: Number(d.wht_amount),
    netAmount: Number(d.net_amount),
    amountWords: amountToThaiWords(Number(d.net_amount)),
    transferDate: String(d.transfer_date).slice(0, 10),
    slipReference: d.slip_reference,
    signaturePng: sig,
  })
  const pdfPath = saveBytes('pdfs', `${number}.pdf`, bytes, rowTenant)
  await db`update vendor_receipts set pdf_path = ${pdfPath}, pdf_sha256 = ${sha256}
    where transaction_id = ${txnId} and user_id = ${rowTenant}`
  return c.json({ ok: true, number, verificationCode: code.toUpperCase(), pdfSha256: sha256, pdfPath })
})

// Vendor memory: remembered defaults from the vendor's tenant history.
// PREPARED, 401-guarded — requires an authenticated client session scoped to the
// vendor's tenant. Client API auth is not implemented yet (admin sessions live on
// ADMIN_PORT with a different cookie), so this never exposes tenant data: it
// returns 401 until the client-auth slice lands. Client recall runs on the mock
// source meanwhile (see src/lib/vendor-memory-source.ts).
app.get('/api/vendor_payees/:id/memory', async (c) => {
  const u = await sessionUser(c.req.header('cookie'))
  const tenantId =
    u?.memberships.find((m) => m.role === 'client_user' || m.role === 'client_admin')?.tenantId ?? null
  if (!tenantId) return c.json({ error: 'unauthorized' }, 401)
  try {
    return c.json(await getVendorMemory(tenantId, c.req.param('id')))
  } catch {
    return c.json({ error: 'unavailable' }, 503)
  }
})

// Tenant settings (per-tenant). PREPARED, session-guarded: requires a client
// session (401 until client API auth ships). client_admin may write; others read.
app.get('/api/settings', async (c) => {
  const u = await requireClient(c)
  const tenantId = u?.memberships[0]?.tenantId
  if (!tenantId) return c.json({ error: 'unauthorized' }, 401)
  try {
    return c.json(await getTenantSettings(tenantId))
  } catch {
    return c.json({ error: 'unavailable' }, 503)
  }
})

app.put('/api/settings', async (c) => {
  const u = await requireClient(c)
  const tenantId = u?.memberships[0]?.tenantId
  if (!tenantId) return c.json({ error: 'unauthorized' }, 401)
  const role = u?.memberships.find((m) => m.tenantId === tenantId)?.role
  if (role !== 'client_admin') return c.json({ error: 'forbidden' }, 403)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'invalid-body' }, 400)
  try {
    await saveTenantSettings(tenantId, body as never)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'invalid-body' }, 400)
  }
})

// ── Asset signing (R2) ──────────────────────────────────────────────────────
// Client-uploaded images (signature, stamp) go to R2. The server never handles
// the bytes — it only issues presigned URLs so credentials stay server-side.
app.get('/api/files/r2-status', async (c) => {
  const u = await requireClient(c)
  if (!u) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ configured: r2Configured() })
})

app.post('/api/files/sign-upload', async (c) => {
  const u = await requireClient(c)
  const tenantId = u?.memberships[0]?.tenantId
  if (!tenantId) return c.json({ error: 'unauthorized' }, 401)
  if (!r2Configured()) return c.json({ error: 'storage-not-configured' }, 503)
  const body = (await c.req.json().catch(() => null)) as { fileName?: string } | null
  if (!body?.fileName) return c.json({ error: 'fileName required' }, 400)
  const result = await signUpload(body.fileName, tenantId)
  if (!result) return c.json({ error: 'signing-failed' }, 500)
  return c.json(result)
})

app.post('/api/files/sign-download', async (c) => {
  const u = await requireClient(c)
  const tenantId = u?.memberships[0]?.tenantId
  if (!tenantId) return c.json({ error: 'unauthorized' }, 401)
  if (!r2Configured()) return c.json({ error: 'storage-not-configured' }, 503)
  const body = (await c.req.json().catch(() => null)) as { path?: string } | null
  if (!body?.path || !body.path.startsWith(`${tenantId}/`)) {
    return c.json({ error: 'invalid-path' }, 400)
  }
  const url = await signDownload(body.path)
  if (!url) return c.json({ error: 'signing-failed' }, 500)
  return c.json({ url })
})

// ── Cron (protected) ──────────────────────────────────────────────────────
// Schedule with Vercel Cron or any scheduler:
//   GET /api/cron/vendor-link-expiry  Authorization: Bearer $CRON_SECRET
// Marks payments whose vendor link lapsed as 'expired' (never touches issued docs).
app.get('/api/cron/vendor-link-expiry', async (c) => {
  const secret = process.env.CRON_SECRET ?? ''
  const auth = c.req.header('authorization') ?? ''
  if (!secret) return c.json({ error: 'cron-not-configured' }, 503)
  if (auth !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
  const db = sql()
  const rows = (await db`
    with lapsed as (
      select distinct vr.transaction_id
      from vendor_requests vr
      where vr.used_at is null and vr.revoked_at is null and vr.expires_at < now()
    )
    update vendor_payables p set status = 'expired'
    where p.id in (select transaction_id from lapsed) and p.status in ('sent','opened')
    returning p.id`) as unknown as { id: string }[]
  return c.json({ ok: true, expired: rows.length })
})

// Public QR verification — status + issue date + masked details only.
// Tenant-agnostic: verification_code is globally unique (004), no tenant filter
// so any client's QR verifies on one endpoint without leaking other fields.
app.get('/api/verify/:code', async (c) => {
  const code = c.req.param('code').toLowerCase()
  const db = sql()
  const rows = await db`
    select r.number, r.status, r.issue_date,
      left(a.vendor_name, 6) || '••' as vendor_masked
    from vendor_receipts r
    join vendor_authorizations a on a.transaction_id = r.transaction_id
    where lower(r.verification_code) = ${code}`
  const r = one<Record<string, unknown>>(rows)
  if (!r) return c.json({ error: 'not-found' }, 404)
  return c.json({ number: r.number, status: r.status, issueDate: r.issue_date, vendorMasked: r.vendor_masked })
})
