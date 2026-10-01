import { monthRange } from '../../src/lib/global-month'
import { andJoin, bindIn, likeNeedle, LIKE_ESCAPE, makeBuilder, type Builder, type SqlFragment } from './sql-builder'
import { WHT_FORM_LABELS, WHT_FORM_TYPES, type WhtListQuery } from '../../src/lib/wht-list-query'
import { whtSortField, type WhtSortField } from '../../src/lib/wht-summary'

// Compiles a WhtListQuery into SQL. Same two safety rules as txn-sql.ts:
// every value is a bound parameter, and the sort column comes from a fixed
// whitelist because it is the one thing Postgres cannot bind.

/** Whitelisted sort expressions. Keys are exactly WhtSortField. */
const ORDER_BY: Record<WhtSortField, string> = {
  date: 'r.issue_date',
  vendor: 'v.name',
  amount: 'r.amount',
  wht: 'r.wht_amount',
}

export function whtOrderByClause(sort: WhtSortQuery): string {
  const col = ORDER_BY[whtSortField(sort)] ?? ORDER_BY.date
  const dir = sort.endsWith('-asc') ? 'asc' : 'desc'
  // The id tiebreaker keeps limit/offset paging deterministic when dates tie.
  return `order by ${col} ${dir}, r.id asc`
}

type WhtSortQuery = WhtListQuery['sort']

/** `limit = 0` is the export sentinel: no paging, return everything. */
export function whtLimitClause(q: WhtListQuery): string {
  if (q.limit === 0) return ''
  return `limit ${Math.trunc(q.limit)} offset ${Math.trunc(q.offset)}`
}

/** Searchable columns — what a bookkeeper would type to find a certificate. */
const SEARCH_COLUMNS = ['r.certificate_no', 'v.name', 'r.description', 'r.note', 'r.id::text']

export function whtWhereClause(q: WhtListQuery, userId: string): SqlFragment {
  const b = makeBuilder()
  const parts: string[] = [`r.user_id = ${b.bind(userId)}`]

  if (q.month) {
    const { from, to } = monthRange(q.month)
    parts.push(`r.issue_date >= ${b.bind(from)}::date`)
    parts.push(`r.issue_date <= ${b.bind(to)}::date`)
  }
  if (q.formType) parts.push(`r.form_type = ${b.bind(q.formType)}`)
  if (q.status === 'active') parts.push(`r.status = ${b.bind('active')}`)
  if (q.status === 'done') parts.push(`r.status = ${b.bind('done')}`)

  if (q.q) {
    const needle = likeNeedle(q.q)
    const any = SEARCH_COLUMNS.map((c) => `${c} ilike ${b.bind(needle)} ${LIKE_ESCAPE}`).join('\n         or ')
    parts.push(`(${any})`)
  }

  return { text: andJoin(parts), params: b.params }
}

/**
 * Headline totals for the WHOLE filtered set. Separate from the page query so
 * the figures never describe just the rows on screen.
 */
export function whtTotalsClause(q: WhtListQuery, userId: string): SqlFragment {
  const w = whtWhereClause(q, userId)
  return {
    text: `
  select
    count(*)::int as count,
    coalesce(sum(r.amount), 0)::numeric as amount,
    coalesce(sum(r.wht_amount), 0)::numeric as wht_amount,
    count(*) filter (where r.status = 'done')::int as filed_count,
    count(*) filter (where r.status <> 'done')::int as active_count,
    count(distinct r.vendor_id)::int as vendors
  from wht_records r
  join wht_vendors v on v.id = r.vendor_id
  where ${w.text}`,
    params: w.params,
  }
}

/**
 * The per-form split, because a return is filed per form. A separate grouped
 * query rather than a clever single one: joining an aggregate back onto itself
 * to produce both shapes in one statement multiplies the rows and quietly
 * corrupts the totals.
 */
export function whtByFormClause(q: WhtListQuery, userId: string): SqlFragment {
  const w = whtWhereClause(q, userId)
  return {
    text: `
  select r.form_type as form_type,
         count(*)::int as count,
         coalesce(sum(r.amount), 0)::numeric as amount,
         coalesce(sum(r.wht_amount), 0)::numeric as wht_amount
  from wht_records r
  join wht_vendors v on v.id = r.vendor_id
  where ${w.text}
  group by r.form_type`,
    params: w.params,
  }
}

/** Form label map, re-exported so the server can label rows without a second import. */
export { WHT_FORM_LABELS, WHT_FORM_TYPES, bindIn, type Builder }
