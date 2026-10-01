import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { parseMonthParam } from './month'
import type { WhtFormType, WhtRecord, WhtVendor } from '../../src/lib/wht'

// ── Client WHT API (certificate templates render client-side; this is storage) ──
// Session-guarded, workspace-scoped, RLS via withTenant. Mirrors the mock store
// so /wht can run server-side when VITE_API_BASE is set.

export const whtRoutes = new Hono()

const FORMS = ['pnd1', 'pnd1_special', 'pnd2', 'pnd3', 'pnd2a', 'pnd3a', 'pnd53']

function toVendor(r: Record<string, unknown>): WhtVendor {
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    name: String(r.name),
    taxId: String(r.tax_id ?? ''),
    address: String(r.address ?? ''),
    contactName: (r.contact_name as string | null) ?? undefined,
    phone: (r.phone as string | null) ?? undefined,
    email: (r.email as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
    vendorType: r.vendor_type === 'individual' ? 'individual' : 'company',
    isActive: Boolean(r.is_active),
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
  }
}

function toRecord(r: Record<string, unknown>): WhtRecord {
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    vendorId: String(r.vendor_id),
    formType: (FORMS.includes(String(r.form_type)) ? String(r.form_type) : 'pnd3') as WhtFormType,
    issueDate: String(r.issue_date ?? '').slice(0, 10),
    amount: Number(r.amount ?? 0),
    whtRate: Number(r.wht_rate ?? 0),
    whtAmount: Number(r.wht_amount ?? 0),
    certificateNo: (r.certificate_no as string | null) ?? undefined,
    description: (r.description as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
    status: r.status === 'done' ? 'done' : 'active',
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
    sourceTransactionId: (r.source_transaction_id as string | null) ?? undefined,
  }
}

whtRoutes.get('/wht/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select * from wht_vendors where user_id = ${g.ws} order by created_at desc`) as unknown as Record<string, unknown>[]
  })
  return c.json({ vendors: rows.map(toVendor) })
})

whtRoutes.post('/wht/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { name?: string; taxId?: string; address?: string; vendorType?: string; contactName?: string; phone?: string; email?: string }
    | null
  const name = (b?.name ?? '').trim()
  if (name.length < 2) return c.json({ error: 'invalid-body' }, 400)
  const vendorType = b?.vendorType === 'individual' ? 'individual' : 'company'
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into wht_vendors (user_id, name, tax_id, address, vendor_type, contact_name, phone, email)
      values (${g.ws}, ${name}, ${(b?.taxId ?? '').replace(/\D/g, '').slice(0, 13)}, ${(b?.address ?? '').trim()},
        ${vendorType}, ${b?.contactName ?? null}, ${b?.phone ?? null}, ${b?.email ?? null})
      returning *`) as unknown as Record<string, unknown>[]
    return ins[0]
  })
  return c.json({ ok: true, vendor: toVendor(row) })
})

whtRoutes.get('/wht/records', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const ids = (c.req.query('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  // Month scope filters on issue_date (certificate period), NOT transfer_date.
  const range = parseMonthParam(c.req.query('month'))
  if (range && 'error' in range) return c.json({ error: 'invalid-month' }, 400)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    if (range && 'from' in range) {
      return (await db`select * from wht_records where user_id = ${g.ws}
        and issue_date >= ${range.from}::date and issue_date <= ${range.to}::date
        order by issue_date desc`) as unknown as Record<string, unknown>[]
    }
    return (await db`select * from wht_records where user_id = ${g.ws} order by issue_date desc`) as unknown as Record<string, unknown>[]
  })
  const filtered = ids.length ? rows.filter((r) => ids.includes(String(r.id))) : rows
  return c.json({ records: filtered.map(toRecord) })
})

whtRoutes.post('/wht/records', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { vendorId?: string; formType?: string; issueDate?: string; amount?: number; whtRate?: number; whtAmount?: number; description?: string; note?: string }
    | null
  if (!b?.vendorId) return c.json({ error: 'invalid-body' }, 400)
  const issueDate = (b.issueDate ?? new Date().toISOString()).slice(0, 10)
  const formType = FORMS.includes(String(b.formType)) ? String(b.formType) : 'pnd3'
  const amount = Number(b.amount) || 0
  const whtRate = Number(b.whtRate) || 0
  const whtAmount = b.whtAmount != null ? Number(b.whtAmount) : Math.round(amount * (whtRate / 100) * 100) / 100
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into wht_records (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount,
        description, note, status, certificate_no)
      values (${g.ws}, ${b!.vendorId}, ${formType}, ${issueDate}, ${amount}, ${whtRate}, ${whtAmount},
        ${b!.description ?? null}, ${b!.note ?? null}, 'active',
        generate_wht_certificate_no(${g.ws}, ${issueDate}::date))
      returning *`) as unknown as Record<string, unknown>[]
    return ins[0]
  })
  return c.json({ ok: true, record: toRecord(row) })
})

whtRoutes.patch('/wht/records/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { status?: string; amount?: number; whtRate?: number; whtAmount?: number } | null
  const status = b?.status === 'done' ? 'done' : b?.status === 'active' ? 'active' : null
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update wht_records set
      status = coalesce(${status}, status),
      amount = coalesce(${b?.amount ?? null}, amount),
      wht_rate = coalesce(${b?.whtRate ?? null}, wht_rate),
      wht_amount = coalesce(${b?.whtAmount ?? null}, wht_amount),
      updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})
