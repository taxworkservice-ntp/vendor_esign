import { Hono } from 'hono'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { sql, withTenant } from '../../src/server/db'
import { isVendorPrefix, prefixRequired } from '../../src/lib/vendor-name'
import { isoDay } from './dates'
import { saveBytesDurable } from './storage'
import { sha256hex } from './auth'
import { authRoutes } from './client-auth'
import { corsMw } from './cors'
import { getTenantSettings, saveTenantSettings } from './settings'
import { r2Configured, signDownload, signUpload } from './r2-storage'
import { dataRoutes, guard } from './data'
import { getPlatformSettingsCached } from './platform'
import { clearImpersonationCookie, impersonationFromCookie } from './impersonation'
import { txnRoutes } from './transactions'
import { whtRoutes } from './wht'
import { receiptRoutes } from './receipts-register'
import { finalizeReceipt } from './receipts'
import { PILOT_TENANT, audit, one, rateLimited } from './shared'

// ── Public client/vendor operation ─────────────────────────────────────
// Vendor links, signing, finalize, QR verify. No login, no admin routes.
// Admin lives in the isolated operation (server/src/admin.ts, ADMIN_PORT).
// Secrets only via env. Never log tokens, ID numbers, or personal data.

const TENANT = PILOT_TENANT

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

// Structured 500s instead of Hono's plain "Internal Server Error" so callers
// (and the smoke test) can tell what failed. No stack is returned.
app.onError((err, c) => {
  console.error('[api]', err)
  return c.json({ error: 'internal-server-error', message: err instanceof Error ? err.message : String(err) }, 500)
})

app.use('*', corsMw())

// Client-operation gate: maintenance mode + read-only impersonation. Applies to
// the client data surface only (auth, announcement, verify and cron are exempt
// so the portal can still load, show the banner, and let the operator stop).
const CLIENT_WRITE_PREFIXES = ['/api/client', '/api/settings', '/api/transactions', '/api/files']
app.use('*', async (c, next) => {
  const path = c.req.path
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)
  const onClientSurface = CLIENT_WRITE_PREFIXES.some((p) => path.startsWith(p))
  if (!onClientSurface) return next()

  const imp = impersonationFromCookie(c.req.header('cookie'))
  if (imp && imp.mode === 'read' && mutating) {
    return c.json({ error: 'impersonation-read-only' }, 403)
  }
  const { maintenance } = await getPlatformSettingsCached()
  if (maintenance.mode === 'full') {
    return c.json({ error: 'maintenance', message: maintenance.message }, 503)
  }
  if (maintenance.mode === 'read_only' && mutating) {
    return c.json({ error: 'maintenance-read-only', message: maintenance.message }, 503)
  }
  return next()
})

// Public platform notice (announcement + maintenance) for the client shell.
app.get('/api/announcement', async (c) => {
  const { announcement, maintenance } = await getPlatformSettingsCached()
  return c.json({ announcement, maintenance })
})

// Leaving impersonation is unauthenticated: it only clears the tw_imp cookie.
app.post('/api/impersonate/stop', (c) => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearImpersonationCookie() },
  })
})

// Client portal auth (login/logout/me/change-password).
app.route('/api/auth', authRoutes)

// Client portal data (vendors + items) — session-guarded, workspace-scoped.
app.route('/api/client', dataRoutes)

// Client transactions (list/get/create/send/revoke/void).
app.route('/api/client', txnRoutes)

// Client WHT records + vendors.
app.route('/api/client', whtRoutes)

// Client receipt register (issued receipts by issue-date period).
app.route('/api/client', receiptRoutes)

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
      t.id, t.ref, t.description, t.note, t.line_items, t.payment_type, t.gross_amount, t.wht_rate,
      t.wht_amount, t.net_amount, t.transfer_date, t.slip_reference, t.status,
      t.tax_id_hash, t.tax_id_last4,
      v.prefix as vendor_prefix, v.name as vendor_name, v.address as vendor_address,
      v.phone as vendor_phone, v.email as vendor_email,
      (select client_code from client_profiles where id = vr.user_id) as client_code
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
    id: r.id, tenantId: rowTenant, clientCode: (r as Record<string, unknown>).client_code ?? null,
    ref: r.ref, description: r.description, note: r.note, lineItems: r.line_items,
    paymentType: r.payment_type,
    grossAmount: r.gross_amount, whtRate: r.wht_rate, whtAmount: r.wht_amount,
    netAmount: r.net_amount, transferDate: r.transfer_date,
    slipReference: r.slip_reference, status: r.status,
    // Gate + confirm-and-sign prefill (name/address are not secret).
    gated: (r as Record<string, unknown>).tax_id_hash != null,
    idLast4: (r as Record<string, unknown>).tax_id_last4 ?? null,
    vendorPrefix: r.vendor_prefix, vendorName: r.vendor_name, vendorAddress: r.vendor_address,
    vendorPhone: (r as Record<string, unknown>).vendor_phone ?? null,
    vendorEmail: (r as Record<string, unknown>).vendor_email ?? null,
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
    vendorPrefix?: string; vendorName?: string; vendorAddress?: string; vendorPhone?: string; vendorEmail?: string;
    idNumberEncrypted?: string; idLast4?: string; signaturePng?: string; consentVersion?: string; lineUserId?: string;
    signMethod?: string;
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
  // How the vendor authorized. Allowlisted (never free text); a drawn signature
  // keeps the historical 'stub-deferred' value, the fallbacks store their method.
  const signMethod: 'drawn' | 'typed-consent' | 'uploaded-signature' =
    body.signMethod === 'typed-consent' || body.signMethod === 'uploaded-signature' ? body.signMethod : 'drawn'
  const verificationMethod = signMethod === 'drawn' ? 'stub-deferred' : signMethod
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
  const sigPath = await saveBytesDurable('signatures', `${txnId}.png`, png, rowTenant)
  // Contact snapshot: what the vendor confirmed at signing (they may have edited
  // the client's record). Immutable from here — the issued PDF reads these.
  const subPhone = String(body.vendorPhone ?? '').trim().slice(0, 50)
  const subEmail = String(body.vendorEmail ?? '').trim().slice(0, 200)
  // Signing reference: the authorization's own identifier, shown to the vendor
  // right away. Distinct from the receipt number (assigned only at issuance, so
  // the statutory series never has gaps).
  const authRef = `AUTH-${randomBytes(4).toString('hex').toUpperCase()}`
  await db`insert into vendor_authorizations
    (user_id, transaction_id, vendor_prefix, vendor_name, vendor_address, vendor_masked_id,
     vendor_phone, vendor_email, auth_ref, signature_image_path, verification_method, line_user_id, ip, user_agent,
     consent_text_version, corrections)
    values (${rowTenant}, ${txnId}, ${subPrefix}, ${subName}, ${subAddr},
      ${`x-xxxx-xxxxx-${last4.slice(0, 2)}-${last4.slice(2)}`},
      ${subPhone}, ${subEmail}, ${authRef},
      ${sigPath}, ${verificationMethod}, ${body.lineUserId ?? null}, ${ip},
      ${(c.req.header('user-agent') ?? '').slice(0, 500)}, 'v1',
      ${JSON.stringify(corrections)})`
  await db`update vendor_requests set used_at = now() where id = ${String(r.req_id)}`
  await db`update vendor_payables set status = 'signed' where id = ${txnId}`
  await withTenant(rowTenant, 'client', async () =>
    audit(rowTenant, 'vendor_payables', txnId, 'vendor.signed', 'vendor',
      { verificationMethod, signMethod, consentVersion: 'v1', corrections, authRef }, ip))

  // Issue the receipt now so the vendor gets the real series number and the PDF
  // immediately — no client round-trip. If issuance fails, the row stays
  // 'signed' and the client can still issue it later via the finalize endpoint.
  let issued: { number: string; verificationCode: string; pdfSha256: string; pdfBase64: string } | undefined
  try {
    const fin = await finalizeReceipt(txnId, ip)
    if (fin.ok) {
      issued = {
        number: fin.number,
        verificationCode: fin.verificationCode,
        pdfSha256: fin.pdfSha256,
        pdfBase64: Buffer.from(fin.pdfBytes).toString('base64'),
      }
    }
  } catch (e) {
    console.error('[sign] issue-failed', e instanceof Error ? e.message : String(e))
  }
  // The buyer (client) profile, so the vendor can render the same receipt sheet
  // locally and download it — the vendor has no client session to fetch settings.
  const clientProfile = await getTenantSettings(rowTenant).catch(() => null)
  return c.json({
    ok: true,
    transactionId: txnId,
    corrections,
    authRef,
    ...issued,
    client: clientProfile
      ? { displayName: clientProfile.displayName, address: clientProfile.address, taxId: clientProfile.taxId }
      : undefined,
  })
})

// Finalize: assign series number + receipt row + PDF in one flow.
// Number is issued inside the same DB txn as the receipt insert
// (generate_doc_number locks the counter row). PDF failure after numbering
// retries with the SAME number — never gaps, never MAX()+1.
// Multi-tenant: tenant + prefix + be_year come from the tenants row.
// Finalize: assign series number + receipt row + PDF in one flow (shared with
// the vendor sign path — see server/src/receipts.ts). Idempotent: an already
// issued receipt returns its stored number/PDF rather than renumbering.
app.post('/api/transactions/:id/finalize', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const res = await finalizeReceipt(c.req.param('id'), ip)
  if (!res.ok) return c.json({ error: res.error }, res.error === 'already-issued' ? 409 : 422)
  return c.json({
    ok: true,
    number: res.number,
    verificationCode: res.verificationCode,
    pdfSha256: res.pdfSha256,
    pdfPath: res.pdfPath,
  })
})

// Tenant settings (per-tenant). PREPARED, session-guarded: requires a client
// session (401 until client API auth ships). client_admin may write; others read.
app.get('/api/settings', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  try {
    return c.json(await getTenantSettings(g.ws))
  } catch {
    return c.json({ error: 'unavailable' }, 503)
  }
})

app.put('/api/settings', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const role = g.impersonating ? 'owner' : g.u?.memberships.find((m) => m.tenantId === g.ws)?.role
  if (!['client_admin', 'owner', 'manager'].includes(String(role))) return c.json({ error: 'forbidden' }, 403)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json({ error: 'invalid-body' }, 400)
  try {
    await saveTenantSettings(g.ws, body as never)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'invalid-body' }, 400)
  }
})

// ── Asset signing (R2) ──────────────────────────────────────────────────────
// Client-uploaded images (signature, stamp) go to R2. The server never handles
// the bytes — it only issues presigned URLs so credentials stay server-side.
app.get('/api/files/r2-status', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  return c.json({ configured: r2Configured() })
})

app.post('/api/files/sign-upload', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  if (!r2Configured()) return c.json({ error: 'storage-not-configured' }, 503)
  const body = (await c.req.json().catch(() => null)) as { fileName?: string } | null
  if (!body?.fileName) return c.json({ error: 'fileName required' }, 400)
  const result = await signUpload(body.fileName, g.ws)
  if (!result) return c.json({ error: 'signing-failed' }, 500)
  return c.json(result)
})

app.post('/api/files/sign-download', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  if (!r2Configured()) return c.json({ error: 'storage-not-configured' }, 503)
  const body = (await c.req.json().catch(() => null)) as { path?: string } | null
  if (!body?.path || !body.path.startsWith(`${g.ws}/`)) {
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
    select r.number, r.status as receipt_status, r.issue_date,
      a.signed_at, a.verification_method,
      p.status as txn_status, p.void_reason,
      left(a.vendor_name, 6) || '••' as vendor_masked
    from vendor_receipts r
    join vendor_authorizations a on a.transaction_id = r.transaction_id
    join vendor_payables p on p.id = r.transaction_id
    where lower(r.verification_code) = ${code}`
  const r = one<Record<string, unknown>>(rows)
  if (!r) return c.json({ error: 'not-found' }, 404)
  const voided = String(r.txn_status ?? '') === 'void'
  return c.json({
    number: r.number,
    // A voided receipt is not a live document, whichever row says what.
    status: voided ? 'void' : r.receipt_status,
    issueDate: isoDay(r.issue_date),
    signedAt: r.signed_at,
    verificationMethod: r.verification_method,
    vendorMasked: r.vendor_masked,
    voidReason: voided ? (r.void_reason ?? null) : null,
  })
})
