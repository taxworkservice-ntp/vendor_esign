import { AWAITING, DEFAULT_THRESHOLDS, NEEDS_SLIP } from '../../src/lib/attention'
import { andJoin, bindIn, likeNeedle, LIKE_ESCAPE, makeBuilder, type Builder, type SqlFragment } from './sql-builder'
import { monthRange } from '../../src/lib/global-month'
import { NON_PAYABLE, sortDir, sortField, type SortField, type SortKey } from '../../src/lib/txn-filters'
import { statusSet, type TxnListQuery } from '../../src/lib/txn-list-query'

// Compiles a validated TxnListQuery into SQL for the transactions list. Two
// rules make this safe:
//
//  1. Every value is a bound parameter. Nothing from the request is ever
//     concatenated into SQL text.
//  2. ORDER BY comes from a fixed whitelist. Sort column and direction are the
//     one thing Postgres cannot bind, so they are mapped, never interpolated.
//
// The `p.id` tiebreaker appended to every ORDER BY is what makes limit/offset
// paging correct: without a total order, rows tying on the sort key can appear
// on two pages, or on none.

/** Whitelisted sort expressions. Keys are exactly SortField. */
const ORDER_BY: Record<Exclude<SortField, 'urgency'>, string> = {
  date: 'p.transfer_date',
  created: 'p.created_at',
  gross: 'p.gross_amount',
  wht: 'p.wht_amount',
  net: 'p.net_amount',
  vendor: 'v.name',
  status: 'p.status',
}

const LAST_ACTIVITY_SQL = `coalesce(
       (select min(vr.opened_at) from vendor_requests vr where vr.transaction_id = p.id),
       (select min(vr.created_at) from vendor_requests vr where vr.transaction_id = p.id),
       p.created_at)`;

const URGENCY_RANK = `case
    when p.status = 'expired' then 0
    when p.status in ('sent', 'opened') and ${LAST_ACTIVITY_SQL} < now() - make_interval(days => ${DEFAULT_THRESHOLDS.awaitingDays}) then 1
    when p.status = 'draft' and p.created_at < now() - make_interval(days => ${DEFAULT_THRESHOLDS.draftDays}) then 2
    when p.status in ('sent', 'opened', 'signed') and p.slip_reference = '' then 3
    else 4
  end`;

export function orderByClause(sort: SortKey): string {
  if (sortField(sort) === 'urgency') {
    const rankDir = sortDir(sort) === 'asc' ? 'desc' : 'asc'
    return `order by ${URGENCY_RANK} ${rankDir}, ${LAST_ACTIVITY_SQL} asc, p.id asc`
  }
  const col = ORDER_BY[sortField(sort) as Exclude<SortField, 'urgency'>] ?? ORDER_BY.date
  const dir = sortDir(sort) === 'asc' ? 'asc' : 'desc'
  return `order by ${col} ${dir}, p.id asc`
}

/** `limit = 0` is the export sentinel: no paging, return the whole set. */
export function limitClause(q: TxnListQuery): string {
  if (q.limit === 0) return ''
  return `limit ${Math.trunc(q.limit)} offset ${Math.trunc(q.offset)}`
}

/**
 * Columns the search box matches against — what a bookkeeper would type.
 * `p.id` is a uuid, so it must be cast before a text operator is applied.
 */
const SEARCH_COLUMNS = [
  'v.name',
  // The vendor title (คำนำหน้าชื่อ) is a separate column; include it and the
  // combined name so "นาย", "นาย สมชาย" and "นายสมชาย" all match.
  'v.prefix',
  "(v.prefix || ' ' || v.name)",
  "replace(v.prefix || ' ' || v.name, ' ', '')",
  'p.description',
  'p.note',
  'p.id::text',
  'p.ref',
  'p.slip_reference',
  `(select rr.number from vendor_receipts rr where rr.transaction_id = p.id order by rr.issue_date desc limit 1)`,
  `(select rr.verification_code from vendor_receipts rr where rr.transaction_id = p.id order by rr.issue_date desc limit 1)`,
]

function buildWhere(q: TxnListQuery, b: Builder, userId: string): string[] {
  // Always the first binding, so the tenant scope is $1 (or $3 once the
  // aggregate seeds the non-payable statuses ahead of it).
  const parts: string[] = [`p.user_id = ${b.bind(userId)}`]

  const statuses = statusSet(q.status)
  if (statuses.length > 0) {
    parts.push(`p.status in ${bindIn(b, statuses)}`)
  }

  // The month is a shortcut that replaces from/to. Resolve it to an inclusive
  // range here so both paths use plain date comparisons.
  if (q.month) {
    const { from, to } = monthRange(q.month)
    parts.push(`p.transfer_date >= ${b.bind(from)}`)
    parts.push(`p.transfer_date <= ${b.bind(to)}`)
  } else {
    if (q.from) parts.push(`p.transfer_date >= ${b.bind(q.from)}`)
    if (q.to) parts.push(`p.transfer_date <= ${b.bind(q.to)}`)
  }

  if (q.paymentType) parts.push(`p.payment_type = ${b.bind(q.paymentType)}`)
  if (q.vendorId) parts.push(`p.vendor_id::text = ${b.bind(q.vendorId)}`)

  if (q.slip === 'with') parts.push("p.slip_reference <> ''")
  if (q.slip === 'without') parts.push("p.slip_reference = ''")

  const min = q.min === '' ? null : Number(q.min)
  if (min !== null && Number.isFinite(min)) parts.push(`p.net_amount >= ${b.bind(min)}`)
  const max = q.max === '' ? null : Number(q.max)
  if (max !== null && Number.isFinite(max)) parts.push(`p.net_amount <= ${b.bind(max)}`)

  if (q.attention) parts.push(attentionClause(b))

  if (q.q) {
    // Shared helper, so the mock path and this one escape wildcards identically.
    const needle = likeNeedle(q.q)
    const any = SEARCH_COLUMNS.map((c) => `${c} ilike ${b.bind(needle)} ${LIKE_ESCAPE}`).join('\n         or ')
    parts.push(`(${any})`)
  }

  return parts
}

/**
 * Last moment the vendor engaged, matching attentionFor's fallback order:
 * when they opened the link, else when it was sent, else when the row was made.
 */
const LAST_ACTIVITY = `coalesce(
       (select min(vr.opened_at) from vendor_requests vr where vr.transaction_id = p.id),
       (select min(vr.created_at) from vendor_requests vr where vr.transaction_id = p.id),
       p.created_at)`

/**
 * The "needs attention" predicate, expressed in SQL from the same status lists
 * and day thresholds the client uses in attentionFor. OR'd because a row needs
 * only one reason to appear in the queue.
 */
function attentionClause(b: Builder): string {
  const awaiting = b.bind(DEFAULT_THRESHOLDS.awaitingDays)
  const draft = b.bind(DEFAULT_THRESHOLDS.draftDays)
  const inAwaiting = AWAITING.map((s) => b.bind(s)).join(', ')
  const inNeedsSlip = NEEDS_SLIP.map((s) => b.bind(s)).join(', ')
  const expired = b.bind('expired')
  return `(
      p.status = ${expired}
   or (p.status in (${inAwaiting}) and ${LAST_ACTIVITY} < now() - make_interval(days => ${awaiting}))
   or (p.status = 'draft' and p.created_at < now() - make_interval(days => ${draft}))
   or (p.status in (${inNeedsSlip}) and p.slip_reference = '')
  )`
}

/** WHERE for the page query. The tenant scope is always the first binding. */
export function whereClause(q: TxnListQuery, userId: string): SqlFragment {
  const b = makeBuilder()
  const parts = buildWhere(q, b, userId)
  return { text: andJoin(parts), params: b.params }
}

/**
 * Aggregate over the WHOLE filtered set — totals must describe every matching
 * row, not the page on screen. Payable figures exclude cancelled and void, so
 * the headline net is money actually owed; the excluded count is reported too
 * so the two can be reconciled.
 */
export function totalsClause(q: TxnListQuery, userId: string): SqlFragment {
  // Non-payable statuses are seeded first so the filter() placeholders resolve
  // ahead of the tenant scope.
  const b = makeBuilder([...NON_PAYABLE])
  const parts = buildWhere(q, b, userId)
  const np = NON_PAYABLE.map((_, i) => `$${i + 1}`).join(', ')
  const keep = `p.status not in (${np})`
  const drop = `p.status in (${np})`

  return {
    text: `
  select
    count(*)::int as count,
    coalesce(sum(p.gross_amount), 0)::numeric as gross,
    coalesce(sum(p.wht_amount), 0)::numeric as wht,
    coalesce(sum(p.net_amount), 0)::numeric as net,
    count(*) filter (where ${keep})::int as payable_count,
    coalesce(sum(p.gross_amount) filter (where ${keep}), 0)::numeric as payable_gross,
    coalesce(sum(p.wht_amount) filter (where ${keep}), 0)::numeric as payable_wht,
    coalesce(sum(p.net_amount) filter (where ${keep}), 0)::numeric as payable_net,
    count(*) filter (where ${drop})::int as voided_count
  from vendor_payables p
  join vendor_payees v on v.id = p.vendor_id
  where ${andJoin(parts)}`,
    params: b.params,
  }
}
