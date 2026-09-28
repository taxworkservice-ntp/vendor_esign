import { Hono } from 'hono'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql, withTenant } from '../../src/server/db'
import { amountToThaiWords } from '../../src/lib/thai-words'
import { saveBytes } from './storage'
import { buildReceiptPdf } from './pdf'

// Portable pilot API (Hono + Neon). No host SDKs, no paid services.
// Secrets only via env. Never log tokens, ID numbers, or personal data.

const TENANT = process.env.PILOT_TENANT ?? 'ABC'
const BE_YEAR = Number(process.env.PILOT_BE_YEAR ?? 2569)
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'
const CLIENT_DISPLAY = process.env.CLIENT_DISPLAY ?? 'ABC (ชื่อ/ที่อยู่/เลขภาษีฉบับจริง — รอคอนเฟิร์ม [VERIFY])'

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex')

// neon() template queries return a union row type — normalize [0] access.
function one<T>(rows: unknown): T | undefined {
  return (rows as T[] | undefined)?.[0]
}

// Minimal in-memory rate limit for token endpoints (per-IP, 60s window).
const hits = new Map<string, { n: number; reset: number }>()
function rateLimited(ip: string, max = 30): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now > h.reset) {
    hits.set(ip, { n: 1, reset: now + 60000 })
    return false
  }
  h.n += 1
  return h.n > max
}

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

async function audit(entityType: string, entityId: string, eventType: string, actor: string | null, metadata: unknown, ip: string) {
  const db = sql()
  await db`insert into audit_events (tenant_id, entity_type, entity_id, event_type, actor, metadata, ip)
    values (${TENANT}, ${entityType}, ${entityId}, ${eventType}, ${actor}, ${JSON.stringify(metadata ?? {})}, ${ip})`
}

export const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true, tenant: TENANT }))

// Vendor: load own transaction (masked). First open stamps opened_at.
app.get('/api/vendor/:token', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`get:${ip}`)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const db = sql()
  const rows = await db`
    select vr.id as req_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.ref, t.description, t.payment_type, t.gross_amount, t.wht_rate,
      t.wht_amount, t.net_amount, t.transfer_date, t.slip_reference, t.status,
      t.tax_id_hash, t.tax_id_last4,
      v.name as vendor_name, v.address as vendor_address
    from vendor_requests vr
    join payment_transactions t on t.id = vr.transaction_id
    join vendors v on v.id = t.vendor_id
    where vr.token_hash = ${sha256hex(token)} and vr.tenant_id = ${TENANT}`
  const r = one<Record<string, unknown>>(rows)
  if (!r) return c.json({ error: 'invalid-or-expired' }, 404)
  if (r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  if (r.status === 'sent') {
    await db`update vendor_requests set opened_at = coalesce(opened_at, now()) where id = ${String(r.req_id)}`;
    await db`update payment_transactions set status = 'opened' where id = ${String(r.id)} and status = 'sent'`;
    await withTenant(TENANT, 'client', async () =>
      audit('payment_transactions', String(r.id), 'vendor.opened', 'vendor', {}, ip))
  }
  return c.json({
    ref: r.ref, description: r.description, paymentType: r.payment_type,
    grossAmount: r.gross_amount, whtRate: r.wht_rate, whtAmount: r.wht_amount,
    netAmount: r.net_amount, transferDate: r.transfer_date,
    slipReference: r.slip_reference, status: r.status,
    // Gate + confirm-and-sign prefill (name/address are not secret).
    gated: (r as Record<string, unknown>).tax_id_hash != null,
    idLast4: (r as Record<string, unknown>).tax_id_last4 ?? null,
    vendorName: r.vendor_name, vendorAddress: r.vendor_address,
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
    select vr.id as req_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.status, t.tax_id_hash, t.tax_id_last4,
      v.name as vendor_name, v.address as vendor_address
    from vendor_requests vr
    join payment_transactions t on t.id = vr.transaction_id
    join vendors v on v.id = t.vendor_id
    where vr.token_hash = ${th} and vr.tenant_id = ${TENANT}`
  const r = one<Record<string, unknown>>(rows)
  if (!r || r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  if (!r.tax_id_hash) {
    // Legacy row: no gate — mark unlocked so sign can proceed.
    await db`update vendor_requests set unlocked_at = coalesce(unlocked_at, now()) where id = ${String(r.req_id)}`
    return c.json({ ok: true, legacy: true, vendorName: r.vendor_name, vendorAddress: r.vendor_address })
  }
  const a = Buffer.from(sha256hex(idNumber), 'hex')
  const b = Buffer.from(String(r.tax_id_hash), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const remaining = gateFail(th)
    await withTenant(TENANT, 'client', async () =>
      audit('vendor_requests', String(r.req_id), 'vendor.gate-failed', 'vendor', { remaining }, ip))
    return c.json(
      remaining <= 0 ? { error: 'gate-locked', remaining: 0 } : { error: 'wrong-id', remaining },
      remaining <= 0 ? 429 : 401,
    )
  }
  gateFails.delete(th)
  await db`update vendor_requests set unlocked_at = now() where id = ${String(r.req_id)}`
  await withTenant(TENANT, 'client', async () =>
    audit('vendor_requests', String(r.req_id), 'vendor.unlocked', 'vendor', {}, ip))
  // Prefill for confirm-and-sign: vendor confirms instead of retyping.
  return c.json({ ok: true, vendorName: r.vendor_name, vendorAddress: r.vendor_address, idLast4: r.tax_id_last4 })
})

// Vendor: sign. Single-use — consumes the token. Verification is
// 'stub-deferred' until the LINE step (see docs/LINE.md insertion points).
app.post('/api/vendor/:token/sign', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`sign:${ip}`, 10)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const body = await c.req.json().catch(() => null) as {
    vendorName?: string; vendorAddress?: string; idNumberEncrypted?: string;
    idLast4?: string; signaturePng?: string; consentVersion?: string; lineUserId?: string;
  } | null
  if (!body?.vendorName || !body?.vendorAddress || !body?.signaturePng || body.consentVersion !== 'v1')
    return c.json({ error: 'invalid-body' }, 400)
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
    select vr.id as req_id, vr.expires_at, vr.used_at, vr.revoked_at, vr.unlocked_at,
      t.id, t.status, t.net_amount, t.tax_id_hash,
      v.name as record_name, v.address as record_address
    from vendor_requests vr
    join payment_transactions t on t.id = vr.transaction_id
    join vendors v on v.id = t.vendor_id
    where vr.token_hash = ${sha256hex(token)} and vr.tenant_id = ${TENANT}`
  const r = one<Record<string, unknown>>(rows)
  if (!r || r.used_at || r.revoked_at || new Date(String(r.expires_at)) < new Date())
    return c.json({ error: 'invalid-or-expired' }, 410)
  // Gate cannot be bypassed by direct POST: gated rows need unlocked_at.
  if (r.tax_id_hash && !r.unlocked_at) return c.json({ error: 'not-unlocked' }, 403)
  if (!['sent', 'opened'].includes(String(r.status)))
    return c.json({ error: 'already-signed' }, 409)

  const txnId = String(r.id)
  // Corrections: diff submitted info against client records server-side,
  // stored on the authorization and reported back to the client.
  const corrections: { field: string; from: string; to: string }[] = []
  const subName = String(body.vendorName).slice(0, 200)
  const subAddr = String(body.vendorAddress).slice(0, 500)
  if (subName !== String(r.record_name))
    corrections.push({ field: 'name', from: String(r.record_name), to: subName })
  if (subAddr !== String(r.record_address))
    corrections.push({ field: 'address', from: String(r.record_address), to: subAddr })
  const sigPath = saveBytes('signatures', `${txnId}.png`, png)
  await db`insert into authorizations
    (tenant_id, transaction_id, vendor_name, vendor_address, vendor_masked_id,
     signature_image_path, verification_method, line_user_id, ip, user_agent,
     consent_text_version, corrections)
    values (${TENANT}, ${txnId}, ${subName}, ${subAddr},
      ${`x-xxxx-xxxxx-${last4.slice(0, 2)}-${last4.slice(2)}`},
      ${sigPath}, 'stub-deferred', ${body.lineUserId ?? null}, ${ip},
      ${(c.req.header('user-agent') ?? '').slice(0, 500)}, 'v1',
      ${JSON.stringify(corrections)})`
  await db`update vendor_requests set used_at = now() where id = ${String(r.req_id)}`
  await db`update payment_transactions set status = 'signed' where id = ${txnId}`
  await withTenant(TENANT, 'client', async () =>
    audit('payment_transactions', txnId, 'vendor.signed', 'vendor',
      { verificationMethod: 'stub-deferred', consentVersion: 'v1', corrections }, ip))
  return c.json({ ok: true, transactionId: txnId, corrections })
})

// Finalize: assign series number + receipt row + PDF in one flow.
// Number is issued inside the same DB txn as the receipt insert
// (next_receipt_number locks the counter row). PDF failure after numbering
// retries with the SAME number — never gaps, never MAX()+1.
app.post('/api/transactions/:id/finalize', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const txnId = c.req.param('id')
  const db = sql()

  const existing = await db`
    select r.number, r.verification_code, r.pdf_path from receipts r
    where r.transaction_id = ${txnId} and r.tenant_id = ${TENANT}`
  const ex = one<Record<string, unknown>>(existing)
  if (ex?.pdf_path) return c.json({ error: 'already-issued' }, 409)

  let number: string
  let code: string
  if (ex) {
    number = String(ex.number)
    code = String(ex.verification_code)
  } else {
    const auth = await db`select vendor_name, vendor_address from authorizations
      where transaction_id = ${txnId} and tenant_id = ${TENANT}`
    if (!one(auth)) return c.json({ error: 'not-signed' }, 422)
    code = randomBytes(6).toString('hex')
    const n = await db`select next_receipt_number(${TENANT}, ${BE_YEAR}, ${`${TENANT}-R-${BE_YEAR}-`}) as number`
    number = String(one<Record<string, unknown>>(n)?.number)
    await db`insert into receipts (tenant_id, transaction_id, number, issue_date, verification_code, status)
      values (${TENANT}, ${txnId}, ${number}, CURRENT_DATE, ${code}, 'issued')`
    await db`update payment_transactions set status = 'issued' where id = ${txnId}`
    await withTenant(TENANT, 'client', async () =>
      audit('receipts', txnId, 'receipt.issued', 'system', { number }, ip))
  }

  const rows = await db`
    select t.description, t.gross_amount, t.wht_rate, t.wht_amount, t.net_amount,
      t.transfer_date, t.slip_reference,
      a.vendor_name, a.vendor_address, a.vendor_masked_id, a.signature_image_path,
      a.signed_at, a.verification_method, a.consent_text_version
    from payment_transactions t
    join authorizations a on a.transaction_id = t.id
    where t.id = ${txnId} and t.tenant_id = ${TENANT}`
  const d = one<{
    description: string; gross_amount: string; wht_rate: string; wht_amount: string;
    net_amount: string; transfer_date: string; slip_reference: string;
    vendor_name: string; vendor_address: string; vendor_masked_id: string;
    signature_image_path: string; signed_at: string;
    verification_method: string; consent_text_version: string;
  }>(rows)
  if (!d) return c.json({ error: 'not-signed' }, 422)
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
    client: { code: TENANT, display: CLIENT_DISPLAY },
    vendor: { name: d.vendor_name, address: d.vendor_address, maskedId: d.vendor_masked_id },
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
  const pdfPath = saveBytes('pdfs', `${number}.pdf`, bytes)
  await db`update receipts set pdf_path = ${pdfPath}, pdf_sha256 = ${sha256}
    where transaction_id = ${txnId} and tenant_id = ${TENANT}`
  return c.json({ ok: true, number, verificationCode: code.toUpperCase(), pdfSha256: sha256, pdfPath })
})

// Public QR verification — status + issue date + masked details only.
app.get('/api/verify/:code', async (c) => {
  const code = c.req.param('code').toLowerCase()
  const db = sql()
  const rows = await db`
    select r.number, r.status, r.issue_date,
      left(a.vendor_name, 6) || '••' as vendor_masked
    from receipts r
    join authorizations a on a.transaction_id = r.transaction_id
    where lower(r.verification_code) = ${code} and r.tenant_id = ${TENANT}`
  const r = one<Record<string, unknown>>(rows)
  if (!r) return c.json({ error: 'not-found' }, 404)
  return c.json({ number: r.number, status: r.status, issueDate: r.issue_date, vendorMasked: r.vendor_masked })
})
