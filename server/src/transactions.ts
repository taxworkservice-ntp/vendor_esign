import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { sha256hex } from './auth'
import { calcWht } from '../../src/lib/wht-calc'
import { itemsSummary, itemsTotal, normalizeLineItem } from '../../src/lib/line-items'
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
    (select r.number from vendor_receipts r where r.transaction_id = p.id
       order by r.issue_date desc limit 1) as receipt_number,
    (select vr.token from vendor_requests vr where vr.transaction_id = p.id
       and vr.used_at is null and vr.revoked_at is null and vr.expires_at > now()
       order by vr.created_at desc limit 1) as invite_token
  from vendor_payables p
  join vendor_payees v on v.id = p.vendor_id`

function toTxn(r: Record<string, unknown>): PaymentTransaction {
  const items = Array.isArray(r.line_items)
    ? (r.line_items as Record<string, unknown>[]).map((it) => normalizeLineItem(it as never))
    : []
  const last4 = String(r.tax_id_last4 ?? '')
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    vendor: {
      id: String(r.vendor_id),
      vendorNo: Number(r.vendor_no ?? 0),
      prefix: String(r.vendor_prefix ?? ''),
      name: String(r.vendor_name ?? ''),
      address: String(r.vendor_address ?? ''),
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
    transferDate: String(r.transfer_date ?? '').slice(0, 10),
    slipReference: String(r.slip_reference ?? ''),
    slipName: String(r.slip_file_path ?? ''),
    status: (r.status as PaymentTransaction['status']) ?? 'draft',
    receiptNumber: (r.receipt_number as string | null) ?? undefined,
    inviteToken: (r.invite_token as string | null) ?? undefined,
    voidReason: (r.void_reason as string | null) ?? undefined,
    taxIdLast4: last4 || undefined,
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
    timeline: [],
    checks: [],
  }
}

txnRoutes.get('/transactions', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db.query(`${SELECT} where p.user_id = $1 order by p.created_at desc`, [g.ws])) as unknown as Record<string, unknown>[]
  })
  return c.json({ transactions: rows.map(toTxn) })
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
    | { vendorId?: string; paymentType?: string; note?: string; lineItems?: unknown; whtRate?: number; whtMode?: string; transferDate?: string; slipReference?: string; slipName?: string; vendorTaxId?: string }
    | null
  const items = (Array.isArray(b?.lineItems) ? b!.lineItems : [])
    .map((it) => normalizeLineItem(it as never))
    .filter((it) => it.description && it.amount > 0)
  if (!b?.vendorId || items.length === 0) return c.json({ error: 'invalid-body' }, 400)
  const whtMode = b.whtMode === 'grossup' ? 'grossup' : 'deduct'
  const { gross, wht, net } = calcWht(itemsTotal(items), Number(b.whtRate) || 0, whtMode)
  const note = (b.note ?? '').trim()
  const taxId = norm(b.vendorTaxId ?? '')
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`
      insert into vendor_payables (user_id, ref, vendor_id, payment_type, description, note, line_items,
        gross_amount, wht_rate, wht_mode, wht_amount, net_amount, transfer_date, slip_reference, status,
        tax_id_hash, tax_id_last4, created_by)
      values (${g.ws}, ${`TX-${Date.now().toString(36)}`}, ${b!.vendorId}, ${b!.paymentType ?? 'ค่าบริการ'},
        ${itemsSummary(items, note)}, ${note}, ${JSON.stringify(items)}::jsonb,
        ${gross}, ${Number(b!.whtRate) || 0}, ${whtMode}, ${wht}, ${net},
        ${b!.transferDate ?? new Date().toISOString().slice(0, 10)}, ${b!.slipReference ?? ''}, 'draft',
        ${taxId ? sha256hex(taxId) : null}, ${taxId.slice(-4) || null}, ${g!.u.email})
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
    await db`update vendor_payables set status = 'sent' where id = ${id} and user_id = ${g.ws} and status = 'draft'`
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
  const id = c.req.param('id')
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update vendor_payables set status = 'void', void_reason = ${(b?.reason ?? '').trim()}
      where id = ${id} and user_id = ${g.ws}`
  })
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
