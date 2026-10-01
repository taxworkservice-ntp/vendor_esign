import { STATUS_GROUPS, sortDir, sortField, type SlipFilter, type SortField, type SortKey, type StatusFilter, type TransactionFilters } from './txn-filters'
import { isValidMonth as isValidMonthParam } from './global-month'

// The one vocabulary for "which transactions, in what order, which slice".
//
// The list has two executors — the mock localStorage store and the Postgres
// endpoint — and they must never disagree. Rather than two parsers that drift,
// both sides read the descriptor built here: the server turns it into SQL
// (server/src/txn-sql.ts), the mock runs it through the pure filter/sort in
// txn-filters.ts. Validating once, here, means a garbage value from a hand-
// edited URL can never widen into a full-table scan or land on a bad offset.
//
// Pure module: no React, no fetch, no storage — importable by the server.

/** Rows per page. Kept small by default: 50 fits a 70vh scroll region. */
export const DEFAULT_PAGE_SIZE = 50

/** Page-size options offered in the UI. */
export const PAGE_SIZES = [25, 50, 100, 200] as const

/** Hard ceiling so a hand-edited `limit` cannot ask the server for everything. */
export const MAX_PAGE_SIZE = 200

/**
 * `limit: 0` means "no paging — return every matching row". Reserved for
 * full-dataset CSV export so export does not need a second query path.
 */
export const EXPORT_LIMIT = 0

export interface TxnListQuery {
  q: string
  status: StatusFilter
  /** YYYY-MM. Shortcut that overrides from/to, mirroring the month filter. */
  month: string
  /** Inclusive YYYY-MM-DD on transferDate. */
  from: string
  to: string
  paymentType: string
  slip: SlipFilter
  min: string
  max: string
  vendorId: string
  /** Restrict to rows that need a human (stale link, forgotten draft, no slip). */
  attention: boolean
  sort: SortKey
  limit: number
  offset: number
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const SORT_FIELDS: readonly SortField[] = ['date', 'gross', 'wht', 'net', 'vendor', 'status']
const SLIPS: readonly SlipFilter[] = ['all', 'with', 'without']
const GROUPS = ['active', 'done', 'voided'] as const

/** Reject impossible days (2026-02-31) that a regex alone would accept. */
function isValidDate(v: string): boolean {
  const m = DATE_RE.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

function asStatus(v: string | null): StatusFilter {
  if (!v || v === 'all') return 'all'
  if ((GROUPS as readonly string[]).includes(v)) return v as StatusFilter
  // An exact TxnStatus, validated against the group members we already know.
  const known = Object.values(STATUS_GROUPS).flat()
  return known.includes(v as never) ? (v as StatusFilter) : 'all'
}

/** Every status a filter resolves to. Empty means "no status constraint". */
export function statusSet(status: StatusFilter): string[] {
  if (status === 'all') return []
  if ((GROUPS as readonly string[]).includes(status)) return [...STATUS_GROUPS[status as keyof typeof STATUS_GROUPS]]
  return [status]
}

/** True when the query constrains anything at all. */
export function isUnfiltered(q: TxnListQuery): boolean {
  return (
    q.q === '' &&
    q.status === 'all' &&
    q.month === '' &&
    q.from === '' &&
    q.to === '' &&
    q.paymentType === '' &&
    q.slip === 'all' &&
    q.min === '' &&
    q.max === '' &&
    q.vendorId === '' &&
    !q.attention
  )
}

/** Strip paging so an export or a total can be computed over the whole set. */
export function unpaged(q: TxnListQuery): TxnListQuery {
  return { ...q, limit: EXPORT_LIMIT, offset: 0 }
}

function str(v: string | null, max: number): string {
  return (v ?? '').trim().slice(0, max)
}

function asSort(v: string | null): SortKey {
  const [field, dir] = (v ?? '').split('-')
  if (!SORT_FIELDS.includes(field as SortField)) return 'date-desc'
  return `${field}-${dir === 'asc' ? 'asc' : 'desc'}` as SortKey
}

/**
 * Build a descriptor from query params, coercing anything unrecognised to a
 * safe default. Never throws and never widens: a bad month or date is dropped
 * rather than reinterpreted as "all time".
 */
export function parseListQuery(sp: URLSearchParams): TxnListQuery {
  const slip = sp.get('slip') ?? ''
  const rawLimit = sp.get('limit')
  const rawOffset = sp.get('offset')

  // `Number(null)` is 0, so the export sentinel must be matched against the
  // literal string. Otherwise an ABSENT limit would read as 0 and return the
  // whole table.
  const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : rawLimit === String(EXPORT_LIMIT) ? EXPORT_LIMIT : boundedLimit(rawLimit)
  const offset = rawOffset === null ? 0 : boundedOffset(rawOffset)

  const month = isValidMonthParam(sp.get('month')) ? (sp.get('month') as string) : ''

  return {
    q: str(sp.get('q'), 120),
    status: asStatus(sp.get('status')),
    month,
    // The month is a shortcut that already bounds the period, so a range sent
    // alongside it is dropped here rather than in each caller. Doing it in the
    // validator means a hand-edited ?month=…&from=… cannot apply a range that
    // looks honoured in the URL but is not.
    from: month ? '' : isValidDate(sp.get('from') ?? '') ? (sp.get('from') as string) : '',
    to: month ? '' : isValidDate(sp.get('to') ?? '') ? (sp.get('to') as string) : '',
    paymentType: str(sp.get('type'), 80),
    slip: (SLIPS as readonly string[]).includes(slip) ? (slip as SlipFilter) : 'all',
    min: str(sp.get('min'), 15),
    max: str(sp.get('max'), 15),
    vendorId: str(sp.get('vendor'), 64),
    attention: sp.get('attention') === '1',
    sort: asSort(sp.get('sort')),
    limit,
    offset,
  }
}

function boundedLimit(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(Math.trunc(n), MAX_PAGE_SIZE)
}

function boundedOffset(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.trunc(n)
}

/** Serialize for the wire. Paging is included whenever it is non-default. */
export function queryToParams(q: TxnListQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (q.q) p.set('q', q.q)
  if (q.status !== 'all') p.set('status', q.status)
  if (q.month) p.set('month', q.month)
  else {
    if (q.from) p.set('from', q.from)
    if (q.to) p.set('to', q.to)
  }
  if (q.paymentType) p.set('type', q.paymentType)
  if (q.slip !== 'all') p.set('slip', q.slip)
  if (q.min) p.set('min', q.min)
  if (q.max) p.set('max', q.max)
  if (q.vendorId) p.set('vendor', q.vendorId)
  if (q.attention) p.set('attention', '1')
  if (q.sort !== 'date-desc') p.set('sort', q.sort)
  if (q.limit !== DEFAULT_PAGE_SIZE) p.set('limit', String(q.limit))
  if (q.offset) p.set('offset', String(q.offset))
  return p
}

/** Project the UI filter state onto the wire shape, dropping paging. */
export function queryFromFilters(f: TransactionFilters): Omit<TxnListQuery, 'limit' | 'offset'> {
  return {
    q: f.search.trim(),
    status: f.status,
    month: f.month,
    // A month already bounds the period; a stale custom range must not narrow
    // it further. parseListQuery enforces this too — this keeps the filter
    // object and the wire query describing the same thing.
    from: f.month ? '' : f.from,
    to: f.month ? '' : f.to,
    paymentType: f.paymentType,
    slip: f.slip,
    min: f.minNet.trim(),
    max: f.maxNet.trim(),
    vendorId: f.vendorId,
    attention: f.attention,
    sort: f.sort,
  }
}

/** The same filters, addressed as a page of results. */
export function pagedQuery(f: TransactionFilters, page: number, pageSize: number): TxnListQuery {
  return {
    ...queryFromFilters(f),
    limit: pageSize,
    offset: Math.max(0, page) * pageSize,
  }
}

export { sortField, sortDir }
