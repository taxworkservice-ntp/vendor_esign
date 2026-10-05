import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { parseMonthParam } from './month'
import { isoDay } from './dates'
import { parseWhtListQuery } from '../../src/lib/wht-list-query'
import {
  whtByFormClause,
  whtLimitClause,
  whtOrderByClause,
  whtTotalsClause,
  whtWhereClause,
} from './wht-sql'
import type { WhtFormType, WhtVendor } from '../../src/lib/wht'
import type { WhtRecordWithVendor } from '../../src/lib/wht'

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

function toRecord(r: Record<string, unknown>): WhtRecordWithVendor {
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    vendorId: String(r.vendor_id),
    formType: (FORMS.includes(String(r.form_type)) ? String(r.form_type) : 'pnd3') as WhtFormType,
    issueDate: isoDay(r.issue_date),
    amount: Number(r.amount ?? 0),
    whtRate: Number(r.wht_rate ?? 0),
    whtAmount: Number(r.wht_amount ?? 0),
    certificateNo: (r.certificate_no as string | null) ?? undefined,
    description: (r.description as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
    status: r.status === 'done' ? 'done' : 'active',
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
    sourceTransactionId: (r.source_transaction_id as string | null) ?? undefined,
    // Joined in, so the list does not need a second full /wht/vendors fetch
    // and a per-row linear scan just to render a name. The tax ID and address
    // come along because a register export has to carry the payee details the
    // return is filed against.
    vendorName: r.vendor_name === null || r.vendor_name === undefined ? undefined : String(r.vendor_name),
    vendorTaxId: r.vendor_tax_id === null || r.vendor_tax_id === undefined ? undefined : String(r.vendor_tax_id),
  }
}

const RECORD_SELECT = `
  select r.*, v.name as vendor_name, v.tax_id as vendor_tax_id
  from wht_records r
  join wht_vendors v on v.id = r.vendor_id`

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
  // An explicit `ids` list still wins — the print view uses it for a small
  // hand-picked selection. A month/form/status scope is the normal path, and it
  // is what makes "print every certificate for this month" possible without
  // putting hundreds of uuids in a URL.
  const ids = (c.req.query('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const query = parseWhtListQuery(new URLSearchParams(c.req.query()))

  const result = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    if (ids.length > 0) {
      const rows = (await db.query(
        `${RECORD_SELECT} where r.user_id = $1 and r.id = any($2::uuid[]) order by r.issue_date desc`,
        [g.ws, ids],
      )) as unknown as Record<string, unknown>[]
      return { records: rows.map(toRecord), total: rows.length, totals: undefined, byForm: [] }
    }

    const where = whtWhereClause(query, g.ws)
    const totalsSql = whtTotalsClause(query, g.ws)
    const byFormSql = whtByFormClause(query, g.ws)
    // Three round trips, not N+1: the page, the headline totals, the form split.
    const [rows, totals, byForm] = await Promise.all([
      db.query(`${RECORD_SELECT}\n  where ${where.text}\n  ${whtOrderByClause(query.sort)}\n  ${whtLimitClause(query)}`, where.params as never[]),
      db.query(totalsSql.text, totalsSql.params as never[]),
      db.query(byFormSql.text, byFormSql.params as never[]),
    ])
    const t = (totals as unknown as Record<string, unknown>[])[0]
    return {
      records: (rows as unknown as Record<string, unknown>[]).map(toRecord),
      total: t ? Number(t.count ?? 0) : 0,
      totals: t
        ? {
            count: Number(t.count ?? 0),
            amount: Number(t.amount ?? 0),
            whtAmount: Number(t.wht_amount ?? 0),
            filedCount: Number(t.filed_count ?? 0),
            activeCount: Number(t.active_count ?? 0),
            vendors: Number(t.vendors ?? 0),
          }
        : undefined,
      byForm: (byForm as unknown as { form_type: WhtFormType; count: number; amount: number; wht_amount: number }[]).map((r) => ({
        formType: r.form_type,
        count: Number(r.count),
        amount: Number(r.amount),
        whtAmount: Number(r.wht_amount),
      })),
    }
  })

  // `summary` is what the page renders; `total` stays a bare count for callers
  // that only need paging maths.
  return c.json({
    records: result.records,
    total: result.total,
    summary: result.totals ? { ...result.totals, byForm: result.byForm } : undefined,
  })
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
  // A certificate with nothing withheld is not a form to file — refuse it so
  // the register only ever holds real withholding.
  if (!(whtAmount > 0)) return c.json({ error: 'no-wht-to-withhold' }, 422)
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
