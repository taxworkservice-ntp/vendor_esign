import type { PaymentTransaction, TxnStatus } from './types'

// Transaction list filters + sorting. Pure functions so they are unit-testable
// and the mock/server paths stay identical.

export type SlipFilter = 'all' | 'with' | 'without'
export type SortKey = 'date-desc' | 'date-asc' | 'net-desc' | 'net-asc'
// Status filter: an exact status, or a convenience group.
export type StatusFilter = 'all' | TxnStatus | 'active' | 'done' | 'voided'

export const STATUS_GROUPS: Record<'active' | 'done' | 'voided', TxnStatus[]> = {
  active: ['draft', 'sent', 'opened', 'signed'],
  done: ['issued'],
  voided: ['void', 'cancelled'],
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
    sort: 'date-desc',
  }
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function currentMonth(today: Date = new Date()): string {
  return ym(today)
}

// Default list view: current month.
export function defaultFilters(today: Date = new Date()): TransactionFilters {
  return { ...emptyFilters(), month: currentMonth(today) }
}

export type PresetId = '7d' | '30d' | 'month' | 'year'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

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

export function filterTransactions(txns: PaymentTransaction[], f: TransactionFilters): PaymentTransaction[] {
  const q = f.search.trim().toLowerCase()
  const min = f.minNet.trim() ? Number(f.minNet) : null
  const max = f.maxNet.trim() ? Number(f.maxNet) : null
  return txns.filter((t) => {
    if (f.status === 'active') {
      if (!STATUS_GROUPS.active.includes(t.status)) return false
    } else if (f.status === 'done') {
      if (!STATUS_GROUPS.done.includes(t.status)) return false
    } else if (f.status === 'voided') {
      if (!STATUS_GROUPS.voided.includes(t.status)) return false
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
    if (q) {
      const hay = `${t.vendor.name} ${t.description} ${t.id} ${t.note ?? ''} ${t.slipReference}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function sortTransactions(txns: PaymentTransaction[], sort: SortKey): PaymentTransaction[] {
  const arr = [...txns]
  const byDate = (a: PaymentTransaction, b: PaymentTransaction) =>
    a.transferDate < b.transferDate ? -1 : a.transferDate > b.transferDate ? 1 : a.id.localeCompare(b.id)
  switch (sort) {
    case 'date-asc':
      arr.sort(byDate)
      break
    case 'net-desc':
      arr.sort((a, b) => b.netAmount - a.netAmount)
      break
    case 'net-asc':
      arr.sort((a, b) => a.netAmount - b.netAmount)
      break
    default:
      arr.sort((a, b) => byDate(b, a))
  }
  return arr
}

export function monthsOf(txns: PaymentTransaction[]): string[] {
  return [...new Set(txns.map((t) => t.transferDate.slice(0, 7)))].sort().reverse()
}

// Number of panel filters active (search/status excluded — they live in the toolbar).
export function activeFilterCount(f: TransactionFilters): number {
  let n = 0
  if (f.from) n++
  if (f.to) n++
  if (f.month) n++
  if (f.paymentType) n++
  if (f.slip !== 'all') n++
  if (f.minNet) n++
  if (f.maxNet) n++
  if (f.vendorId) n++
  if (f.sort !== 'date-desc') n++
  return n
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
  if (f.sort !== 'date-desc') p.set('sort', f.sort)
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
  f.sort = (sp.get('sort') as SortKey) || 'date-desc'
  return f
}
