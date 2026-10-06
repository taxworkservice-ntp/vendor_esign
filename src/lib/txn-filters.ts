import { attentionFor, type AttentionThresholds } from './attention'
import type { PaymentTransaction, TxnStatus } from './types'

// Transaction list filters + sorting. Pure functions so they are unit-testable
// and the mock/server paths stay identical.

export type SlipFilter = 'all' | 'with' | 'without'
export type SortField = 'date' | 'created' | 'gross' | 'wht' | 'net' | 'vendor' | 'status' | 'urgency'
export type SortKey = `${SortField}-${'asc' | 'desc'}`
// Status filter: an exact status, or a convenience group. The maker queue adds
// three workflow groups on top of the accounting groups: needs-link (owe the
// vendor a link), awaiting (chasing a signature), ready (signed, hand off).
export type StatusFilter = 'all' | TxnStatus | 'active' | 'done' | 'voided' | 'needs-link' | 'awaiting' | 'ready'

// Thai status labels live here, not in a component, so the toolbar chips, the
// advanced <select>, the summary and the active-filter chips can never drift
// apart. `components/ui/badge.tsx` adds only the colour classes on top.
export const STATUS_LABELS: Record<TxnStatus, string> = {
  draft: 'ฉบับร่าง',
  sent: 'ส่งลิงก์แล้ว',
  opened: 'เปิดลิงก์แล้ว',
  signed: 'ลงนามแล้ว',
  issued: 'ออกใบเสร็จแล้ว',
  expired: 'หมดอายุ',
  cancelled: 'เพิกถอนลิงก์',
  void: 'ยกเลิกเอกสาร',
}

export const STATUS_GROUP_LABELS: Record<'active' | 'done' | 'voided' | 'needs-link' | 'awaiting' | 'ready', string> = {
  active: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  voided: 'ยกเลิกเอกสาร',
  'needs-link': 'ต้องส่งลิงก์',
  awaiting: 'รอลงนาม',
  ready: 'พร้อมออกใบเสร็จ',
}

/** Human label for any status filter, group or exact. */
export function statusLabel(status: StatusFilter): string {
  if (status === 'all') return 'ทั้งหมด'
  if (status in STATUS_GROUP_LABELS) return STATUS_GROUP_LABELS[status as keyof typeof STATUS_GROUP_LABELS]
  return STATUS_LABELS[status as TxnStatus] ?? status
}

/**
 * Statuses excluded from the "payable" totals. `cancelled` and `void` are
 * documents that no longer represent money owed; `expired` is NOT excluded —
 * the transfer happened, the vendor simply has to be chased, so it stays in.
 */
export const NON_PAYABLE: TxnStatus[] = ['cancelled', 'void']

export function sortField(key: SortKey): SortField {
  return key.split('-')[0] as SortField
}

export function sortDir(key: SortKey): 'asc' | 'desc' {
  return key.endsWith('asc') ? 'asc' : 'desc'
}

// Clicking a header: same column toggles direction, a new column defaults to
// descending (newest / largest first).
export function nextSort(current: SortKey, field: SortField): SortKey {
  const dir = sortField(current) === field && sortDir(current) === 'desc' ? 'asc' : 'desc'
  return `${field}-${dir}` as SortKey
}

export const STATUS_GROUPS: Record<'active' | 'done' | 'voided' | 'needs-link' | 'awaiting' | 'ready', TxnStatus[]> = {
  active: ['draft', 'sent', 'opened', 'signed'],
  done: ['issued'],
  voided: ['void', 'cancelled'],
  'needs-link': ['draft', 'expired', 'cancelled'],
  awaiting: ['sent', 'opened'],
  ready: ['signed'],
}

export interface TransactionFilters {
  search: string
  status: StatusFilter
  from: string // transfer date >= (YYYY-MM-DD)
  to: string // transfer date <= (YYYY-MM-DD)
  month: string // YYYY-MM (shortcut; overrides from/to)
  paymentType: string
  slip: SlipFilter
  minNet: string
  maxNet: string
  vendorId: string
  /** Show only rows that need a human: stale link, forgotten draft, no slip. */
  attention: boolean
  sort: SortKey
}

export function emptyFilters(): TransactionFilters {
  return {
    search: '',
    status: 'all',
    from: '',
    to: '',
    month: '',
    paymentType: '',
    slip: 'all',
    minNet: '',
    maxNet: '',
    vendorId: '',
    attention: false,
    // Most-recently-edited first: the register reads like a work queue.
    sort: 'created-desc',
  }
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function currentMonth(today: Date = new Date()): string {
  return ym(today)
}

// Month string (YYYY-MM) shifted by `offset` months from `today`.
export function monthOffset(offset: number, today: Date = new Date()): string {
  return ym(new Date(today.getFullYear(), today.getMonth() + offset, 1))
}

export function previousMonth(today: Date = new Date()): string {
  return monthOffset(-1, today)
}

// Default list view: current month.
export function defaultFilters(today: Date = new Date()): TransactionFilters {
  return { ...emptyFilters(), month: currentMonth(today) }
}

export type PresetId = '7d' | '30d' | 'month' | 'year'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Today's date as local YYYY-MM-DD (wall calendar, not UTC — toISOString()
// would shift the day near midnight in +07:00). Used for new-form defaults.
export function todayISO(today: Date = new Date()): string {
  return iso(today)
}

export function presetRange(id: PresetId, today: Date = new Date()): { from: string; to: string } {
  const to = iso(today)
  if (id === '7d') {
    const d = new Date(today)
    d.setDate(d.getDate() - 6)
    return { from: iso(d), to }
  }
  if (id === '30d') {
    const d = new Date(today)
    d.setDate(d.getDate() - 29)
    return { from: iso(d), to }
  }
  if (id === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  return { from: iso(new Date(today.getFullYear(), 0, 1)), to }
}

export function filterTransactions(
  txns: PaymentTransaction[],
  f: TransactionFilters,
  // `today` exists so the aging rules are deterministic under test; the
  // threshold override must match the server's, which is the whole point of
  // routing `attention` through the shared contract.
  opts: { attentionThresholds?: AttentionThresholds; today?: Date } = {},
): PaymentTransaction[] {
  const q = f.search.trim().toLowerCase()
  const min = f.minNet.trim() ? Number(f.minNet) : null
  const max = f.maxNet.trim() ? Number(f.maxNet) : null
  return txns.filter((t) => {
    if (f.status in STATUS_GROUPS) {
      if (!STATUS_GROUPS[f.status as keyof typeof STATUS_GROUPS].includes(t.status)) return false
    } else if (f.status !== 'all' && t.status !== f.status) {
      return false
    }
    if (f.month && !t.transferDate.startsWith(f.month)) return false
    if (f.from && t.transferDate < f.from) return false
    if (f.to && t.transferDate > f.to) return false
    if (f.paymentType && t.paymentType !== f.paymentType) return false
    if (f.slip === 'with' && !t.slipReference) return false
    if (f.slip === 'without' && t.slipReference) return false
    if (min !== null && !Number.isNaN(min) && t.netAmount < min) return false
    if (max !== null && !Number.isNaN(max) && t.netAmount > max) return false
    if (f.vendorId && t.vendor.id !== f.vendorId) return false
    if (f.attention && !attentionFor(t, opts.today, opts.attentionThresholds)) return false
    if (q) {
      // Include the vendor title and the combined name, matching the server's
      // search columns ("นาย" / "นาย สมชาย" / "นายสมชาย"), plus the receipt
      // number and verification code the maker looks up from paper.
      const pfx = t.vendor.prefix ?? ''
      const hay = `${pfx} ${t.vendor.name} ${pfx}${t.vendor.name} ${t.description} ${t.id} ${t.note ?? ''} ${t.slipReference} ${t.receiptNumber ?? ''} ${t.verificationCode ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function urgencyRank(t: PaymentTransaction, today: Date = new Date()): { rank: number; days: number } {
  const a = attentionFor(t, today)
  if (!a) return { rank: 4, days: 0 }
  if (a.kind === 'expired-link') return { rank: 0, days: a.days }
  if (a.kind === 'awaiting-vendor') return { rank: 1, days: a.days }
  if (a.kind === 'stale-draft') return { rank: 2, days: a.days }
  return { rank: 3, days: a.days }
}

export function sortTransactions(txns: PaymentTransaction[], sort: SortKey, today: Date = new Date()): PaymentTransaction[] {
  const field = sortField(sort)
  const dir = sortDir(sort)
  const arr = [...txns]
  if (field === 'urgency') {
    arr.sort((a, b) => {
      const ra = urgencyRank(a, today)
      const rb = urgencyRank(b, today)
      let by = ra.rank - rb.rank
      if (by === 0) {
        if (ra.rank < 4) {
          by = rb.days - ra.days || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
        } else {
          by = a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
        }
      }
      return (dir === 'desc' ? by : -by) || a.id.localeCompare(b.id)
    })
    return arr
  }
  // Thai text must sort by Thai collation, not UTF-16 code units, or
  // "ก" and "ข" land in the wrong place.
  const cmpText = (a: string, b: string) => a.localeCompare(b, 'th')
  if (field === 'vendor') {
    arr.sort((a, b) => {
      const by = cmpText(a.vendor.name, b.vendor.name)
      return (dir === 'asc' ? by : -by) || a.id.localeCompare(b.id)
    })
    return arr
  }
  if (field === 'status') {
    arr.sort((a, b) => {
      const by = cmpText(STATUS_LABELS[a.status], STATUS_LABELS[b.status])
      return (dir === 'asc' ? by : -by) || a.id.localeCompare(b.id)
    })
    return arr
  }
  if (field === 'date') {
    arr.sort((a, b) => {
      const by = a.transferDate < b.transferDate ? -1 : a.transferDate > b.transferDate ? 1 : 0
      return (dir === 'asc' ? by : -by) || a.id.localeCompare(b.id)
    })
    return arr
  }
  if (field === 'created') {
    arr.sort((a, b) => {
      const by = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
      return (dir === 'asc' ? by : -by) || a.id.localeCompare(b.id)
    })
    return arr
  }
  const pick = (t: PaymentTransaction) =>
    field === 'gross' ? t.grossAmount : field === 'wht' ? t.whtAmount : t.netAmount
  arr.sort((a, b) => (dir === 'asc' ? pick(a) - pick(b) : pick(b) - pick(a)) || a.id.localeCompare(b.id))
  return arr
}

// ── Totals ────────────────────────────────────────────────────────────────
// Aggregates are computed over the WHOLE filtered set, never over the visible
// page, so the headline figures stay honest under paging. The server returns
// the same shape from a SQL aggregate; the mock computes it from the rows.

export interface TxnTotals {
  /** Every matching row, including cancelled/void. */
  count: number
  gross: number
  wht: number
  net: number
  /** Matching rows that still represent money owed. */
  payableCount: number
  payableGross: number
  payableWht: number
  payableNet: number
  /** Matching rows excluded from the payable figures. */
  voidedCount: number
}

export function emptyTotals(): TxnTotals {
  return {
    count: 0,
    gross: 0,
    wht: 0,
    net: 0,
    payableCount: 0,
    payableGross: 0,
    payableWht: 0,
    payableNet: 0,
    voidedCount: 0,
  }
}

export function summarize(txns: PaymentTransaction[]): TxnTotals {
  const t = emptyTotals()
  for (const x of txns) {
    t.count++
    t.gross += x.grossAmount
    t.wht += x.whtAmount
    t.net += x.netAmount
    if (NON_PAYABLE.includes(x.status)) {
      t.voidedCount++
      continue
    }
    t.payableCount++
    t.payableGross += x.grossAmount
    t.payableWht += x.whtAmount
    t.payableNet += x.netAmount
  }
  return t
}

// ── Paging ────────────────────────────────────────────────────────────────

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(total / pageSize))
}

/** Last page index (0-based) that actually holds rows. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.max(0, Math.min(Math.floor(page) || 0, pageCount(total, pageSize) - 1))
}

/** 1-based inclusive range of row numbers on the current page, for "showing X–Y". */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 }
  const from = page * pageSize + 1
  return { from, to: Math.min(total, from + pageSize - 1) }
}

// ── Active-filter description ─────────────────────────────────────────────
// The "ตัวกรอง N" badge says how many; these say which, so a user can see what
// is narrowing the list without reopening the panel. Order is stable.

export interface ActiveFilter {
  key: keyof TransactionFilters
  label: string
}

export function describeActiveFilters(
  f: TransactionFilters,
  opts: { vendorName?: (id: string) => string } = {},
): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (f.search.trim()) out.push({ key: 'search', label: `ค้นหา “${f.search.trim()}”` })
  if (f.status !== 'all') out.push({ key: 'status', label: `สถานะ: ${statusLabel(f.status)}` })
  if (f.from) out.push({ key: 'from', label: `ตั้งแต่ ${f.from}` })
  if (f.to) out.push({ key: 'to', label: `ถึง ${f.to}` })
  if (f.paymentType) out.push({ key: 'paymentType', label: `ประเภท: ${f.paymentType}` })
  if (f.slip !== 'all') {
    out.push({ key: 'slip', label: `สลิป: ${f.slip === 'with' ? 'มีสลิป' : 'ยังไม่แนบ'}` })
  }
  if (f.minNet) out.push({ key: 'minNet', label: `สุทธิ ≥ ${f.minNet}` })
  if (f.maxNet) out.push({ key: 'maxNet', label: `สุทธิ ≤ ${f.maxNet}` })
  if (f.vendorId) {
    out.push({ key: 'vendorId', label: `ผู้ขาย: ${opts.vendorName?.(f.vendorId) ?? f.vendorId}` })
  }
  if (f.attention) out.push({ key: 'attention', label: 'ต้องติดตาม' })
  return out
}

export function monthsOf(txns: PaymentTransaction[]): string[] {
  return [...new Set(txns.map((t) => t.transferDate.slice(0, 7)))].sort().reverse()
}

// ── Period resolution ──────────────────────────────────────────────────────
// The header period control is the app's single source of truth: one month
// drives Transactions, WHT and Metrics. This function is the ONLY place that
// decides what the transaction list should show for that period, so the rule
// is testable without a DOM and cannot be re-implemented inconsistently.
//
// A custom date range (7 วัน / 30 วัน / a shared link) is a deliberate
// per-page override, so it survives a re-render — but an explicit pick in the
// header supersedes it, because "show me October" cannot reasonably mean
// "October, except for the range I set here".

export interface PeriodResolution {
  month: string
  from: string
  to: string
}

export function resolvePeriod(
  filters: TransactionFilters,
  globalMonth: string,
  opts: { explicitPick?: boolean } = {},
): PeriodResolution {
  const hasRange = !!filters.from || !!filters.to
  if (hasRange && !opts.explicitPick) {
    return { month: '', from: filters.from, to: filters.to }
  }
  return { month: globalMonth, from: '', to: '' }
}

/** True when the view is on a custom range rather than the header period. */
export function isCustomRange(f: TransactionFilters): boolean {
  return !f.month && (!!f.from || !!f.to)
}

// Count of active filters. Derived from describeActiveFilters so the toolbar
// badge and the removable chips can never disagree about the same state.
export function activeFilterCount(f: TransactionFilters): number {
  return describeActiveFilters(f).length
}

export function filtersToParams(f: TransactionFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.search) p.set('q', f.search)
  if (f.status !== 'all') p.set('status', f.status)
  if (f.month) p.set('month', f.month)
  else {
    if (f.from) p.set('from', f.from)
    if (f.to) p.set('to', f.to)
  }
  if (f.paymentType) p.set('type', f.paymentType)
  if (f.slip !== 'all') p.set('slip', f.slip)
  if (f.minNet) p.set('min', f.minNet)
  if (f.maxNet) p.set('max', f.maxNet)
    if (f.vendorId) p.set('vendor', f.vendorId)
    if (f.attention) p.set('attention', '1')
    if (f.sort !== 'created-desc') p.set('sort', f.sort)
  return p
}

export function filtersFromParams(sp: URLSearchParams): TransactionFilters {
  const f = emptyFilters()
  f.search = sp.get('q') ?? ''
  f.status = (sp.get('status') as TransactionFilters['status']) || 'all'
  f.month = sp.get('month') ?? ''
  f.from = sp.get('from') ?? ''
  f.to = sp.get('to') ?? ''
  f.paymentType = sp.get('type') ?? ''
  f.slip = (sp.get('slip') as SlipFilter) || 'all'
  f.minNet = sp.get('min') ?? ''
  f.maxNet = sp.get('max') ?? ''
  f.vendorId = sp.get('vendor') ?? ''
  f.attention = sp.get('attention') === '1'
  f.sort = (sp.get('sort') as SortKey) || 'created-desc'
  return f
}
