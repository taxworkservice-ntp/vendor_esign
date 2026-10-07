import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { parseMonthParam } from './month'
import { isoDay } from './dates'

// ── Client receipt register ──────────────────────────────────────────────────
// Session-guarded, workspace-scoped, RLS via withTenant. One row per ISSUED
// receipt, scoped by the receipt's own issue date (a document belongs to the
// period it was issued, not the payment date) — so it mirrors the WHT register.
// ORDER BY and the search columns come from fixed whitelists; every value is a
// bound parameter.

export interface ReceiptRegisterRow {
  id: string // source transaction id (drives /receipts/:id)
  number: string
  issueDate: string
  transferDate: string
  verificationCode?: string
  vendorPrefix?: string
  vendorName?: string
  grossAmount: number
  whtRate: number
  whtAmount: number
  netAmount: number
  /** Last activity (issued or last edited), ISO datetime — default order key. */
  updatedAt?: string
}

export interface ReceiptRegisterSummary {
  count: number
  gross: number
  wht: number
  net: number
}

export const receiptRoutes = new Hono()

/** Whitelisted sort expressions. Keys match the client sort fields. */
const ORDER_BY: Record<string, string> = {
  // Last activity: the receipt was added (r.created_at) or the payable edited.
  // A second-precision timestamp, unlike the day-only issue/transfer dates, so
  // same-day receipts still order deterministically.
  updated: 'greatest(r.created_at, coalesce(p.updated_at, r.created_at))',
  // The register is scoped by the payment date (the receipt's accounting
  // period), matching the transaction list and the WHT register.
  date: 'p.transfer_date',
  issue: 'r.issue_date',
  number: 'r.number',
  vendor: 'vendor_name',
  gross: 'p.gross_amount',
  wht: 'p.wht_amount',
  net: 'p.net_amount',
}

const DEFAULT_SORT = 'updated-desc'

const FROM = `
  from vendor_receipts r
  join vendor_payables p on p.id = r.transaction_id and p.user_id = r.user_id
  join vendor_payees v on v.id = p.vendor_id
  left join vendor_authorizations a on a.transaction_id = r.transaction_id and a.user_id = r.user_id`

const SELECT = `
  select p.id, r.number, r.issue_date, p.transfer_date, r.verification_code,
    coalesce(a.vendor_prefix, v.prefix) as vendor_prefix,
    coalesce(a.vendor_name, v.name) as vendor_name,
    p.gross_amount, p.wht_rate, p.wht_amount, p.net_amount,
    greatest(r.created_at, coalesce(p.updated_at, r.created_at)) as updated_at`

function toRow(r: Record<string, unknown>): ReceiptRegisterRow {
  return {
    id: String(r.id),
    number: String(r.number ?? ''),
    issueDate: isoDay(r.issue_date),
    transferDate: isoDay(r.transfer_date),
    verificationCode: r.verification_code ? String(r.verification_code) : undefined,
    vendorPrefix: r.vendor_prefix ? String(r.vendor_prefix) : undefined,
    vendorName: r.vendor_name ? String(r.vendor_name) : undefined,
    grossAmount: Number(r.gross_amount ?? 0),
    whtRate: Number(r.wht_rate ?? 0),
    whtAmount: Number(r.wht_amount ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    updatedAt: isoDateTime(r.updated_at),
  }
}

/** timestamptz → ISO datetime. The driver may hand back a Date (Neon) or a
 *  string; both are normalized here so the client always gets one shape. */
function isoDateTime(v: unknown): string | undefined {
  if (v == null) return undefined
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

receiptRoutes.get('/receipts', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)

  const month = parseMonthParam(c.req.query('month'))
  if (month && 'error' in month) return c.json({ error: month.error }, 400)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()

  // Paging: `limit=0` is the export sentinel (whole set, no LIMIT).
  const rawLimit = Number(c.req.query('limit') ?? 50)
  const limit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(1000, Math.trunc(rawLimit))) : 50
  const offset = Math.max(0, Math.trunc(Number(c.req.query('offset') ?? 0)) || 0)

  const params: unknown[] = [g.ws]
  const conds = ['r.user_id = $1', "r.status = 'issued'"]
  if (month) {
    params.push(month.from)
    const a = `$${params.length}`
    params.push(month.to)
    const b = `$${params.length}`
    conds.push(`p.transfer_date >= ${a}::date`, `p.transfer_date <= ${b}::date`)
  }
  if (q) {
    params.push('%' + q + '%')
    const p = `$${params.length}`
    conds.push(`(lower(r.number) like ${p} or lower(v.name) like ${p} or lower(coalesce(a.vendor_name, '')) like ${p})`)
  }
  const where = `where ${conds.join(' and ')}`

  const sortRaw = (c.req.query('sort') ?? DEFAULT_SORT).split('-')
  const col = ORDER_BY[sortRaw[0]] ?? ORDER_BY.updated
  const dir = sortRaw[1] === 'asc' ? 'asc' : 'desc'
  const orderBy = `order by ${col} ${dir}, r.id asc`
  const paging = limit > 0 ? `limit $${params.length + 1} offset $${params.length + 2}` : ''
  const rowParams = limit > 0 ? [...params, limit, offset] : params

  const result = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    const [rows, agg] = await Promise.all([
      db.query(`${SELECT}\n  ${FROM}\n  ${where}\n  ${orderBy}\n  ${paging}`, rowParams as never[]),
      db.query(
        `select count(*)::int as count, coalesce(sum(p.gross_amount), 0) as gross,
           coalesce(sum(p.wht_amount), 0) as wht, coalesce(sum(p.net_amount), 0) as net
         ${FROM} ${where}`,
        params as never[],
      ),
    ])
    const t = (agg as unknown as Record<string, unknown>[])[0]
    return {
      receipts: (rows as unknown as Record<string, unknown>[]).map(toRow),
      total: t ? Number(t.count ?? 0) : 0,
      summary: {
        count: t ? Number(t.count ?? 0) : 0,
        gross: t ? Number(t.gross ?? 0) : 0,
        wht: t ? Number(t.wht ?? 0) : 0,
        net: t ? Number(t.net ?? 0) : 0,
      } satisfies ReceiptRegisterSummary,
    }
  })

  return c.json(result)
})
