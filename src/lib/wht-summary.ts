import { WHT_FORM_TYPES, whtFormLabel, type WhtFormType, type WhtRecord } from './wht'

// Totals for a WHT register.
//
// A withholding-tax register exists to be reconciled against a filed return, so
// the two numbers that matter are the total base amount and the total tax
// withheld — plus the split by form type, because a return is filed per form.
// The list had no aggregate at all: the user added up rows by eye.
//
// This is the mock-side reference implementation. The server computes the same
// shape in SQL (server/src/wht-sql.ts) and the totals describe the WHOLE filtered
// set, never just the page on screen — otherwise the headline figure would
// change as you paged, which is the bug the transaction list already avoids.

export interface WhtFormTotal {
  formType: WhtFormType
  label: string
  count: number
  /** Base amount the tax was withheld from. */
  amount: number
  whtAmount: number
}

export interface WhtSummary {
  count: number
  amount: number
  whtAmount: number
  /** Certificates already marked filed. */
  filedCount: number
  activeCount: number
  /** Only forms actually present, in canonical order. */
  byForm: WhtFormTotal[]
  vendors: number
}

export function emptyWhtSummary(): WhtSummary {
  return { count: 0, amount: 0, whtAmount: 0, filedCount: 0, activeCount: 0, byForm: [], vendors: 0 }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeWht(records: WhtRecord[]): WhtSummary {
  const out = emptyWhtSummary()
  const byForm = new Map<WhtFormType, WhtFormTotal>()
  const vendorIds = new Set<string>()

  for (const r of records) {
    // Corrections (voided / superseded certificates) are not part of the live
    // register figures even if a caller passes them unfiltered.
    if (r.status === 'void' || r.status === 'superseded') continue
    out.count++
    out.amount += r.amount
    out.whtAmount += r.whtAmount
    if (r.status === 'done') out.filedCount++
    else out.activeCount++
    vendorIds.add(r.vendorId)

    const form = r.formType as WhtFormType
    const cur = byForm.get(form) ?? { formType: form, label: whtFormLabel(form), count: 0, amount: 0, whtAmount: 0 }
    cur.count++
    cur.amount += r.amount
    cur.whtAmount += r.whtAmount
    byForm.set(form, cur)
  }

  out.amount = round2(out.amount)
  out.whtAmount = round2(out.whtAmount)
  out.vendors = vendorIds.size
  out.byForm = WHT_FORM_TYPES.filter((f) => byForm.has(f)).map((f) => {
    const t = byForm.get(f)!
    return { ...t, amount: round2(t.amount), whtAmount: round2(t.whtAmount) }
  })
  // A form type the server accepts but this build does not know still gets a row,
  // so an unfamiliar code is visible rather than silently dropped from the total.
  for (const [form, t] of byForm) {
    if (!WHT_FORM_TYPES.includes(form)) {
      out.byForm.push({ ...t, amount: round2(t.amount), whtAmount: round2(t.whtAmount) })
    }
  }
  return out
}

export type WhtStatusFilter = 'all' | 'active' | 'done'
export type WhtSortKey =
  | 'date-desc' | 'date-asc'
  | 'vendor-asc' | 'vendor-desc'
  | 'cert-asc' | 'cert-desc'
  | 'form-asc' | 'form-desc'
  | 'amount-desc' | 'amount-asc'
  | 'wht-desc' | 'wht-asc'
  | 'status-asc' | 'status-desc'

export const WHT_SORT_FIELDS = ['date', 'vendor', 'cert', 'form', 'amount', 'wht', 'status'] as const
export type WhtSortField = (typeof WHT_SORT_FIELDS)[number]

const SORTERS: Record<WhtSortKey, (a: WhtRecord & { vendorName?: string }, b: WhtRecord & { vendorName?: string }) => number> = {
  'date-desc': (a, b) => cmp(b.issueDate, a.issueDate) || cmp(a.id, b.id),
  'date-asc': (a, b) => cmp(a.issueDate, b.issueDate) || cmp(a.id, b.id),
  'vendor-asc': (a, b) => cmp(a.vendorName ?? '', b.vendorName ?? '') || cmp(a.issueDate, b.issueDate),
  'vendor-desc': (a, b) => cmp(b.vendorName ?? '', a.vendorName ?? '') || cmp(a.issueDate, b.issueDate),
  'cert-asc': (a, b) => cmp(a.certificateNo ?? '', b.certificateNo ?? '') || cmp(a.id, b.id),
  'cert-desc': (a, b) => cmp(b.certificateNo ?? '', a.certificateNo ?? '') || cmp(a.id, b.id),
  'form-asc': (a, b) => cmp(a.formType, b.formType) || cmp(a.issueDate, b.issueDate),
  'form-desc': (a, b) => cmp(b.formType, a.formType) || cmp(a.issueDate, b.issueDate),
  'amount-desc': (a, b) => b.amount - a.amount || cmp(a.id, b.id),
  'amount-asc': (a, b) => a.amount - b.amount || cmp(a.id, b.id),
  'wht-desc': (a, b) => b.whtAmount - a.whtAmount || cmp(a.id, b.id),
  'wht-asc': (a, b) => a.whtAmount - b.whtAmount || cmp(a.id, b.id),
  'status-asc': (a, b) => cmp(a.status, b.status) || cmp(a.issueDate, b.issueDate),
  'status-desc': (a, b) => cmp(b.status, a.status) || cmp(a.issueDate, b.issueDate),
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function whtSortField(sort: WhtSortKey): WhtSortField {
  const f = sort.split('-')[0]
  return (WHT_SORT_FIELDS as readonly string[]).includes(f) ? (f as WhtSortField) : 'date'
}

export function sortWht<T extends WhtRecord & { vendorName?: string }>(records: T[], sort: WhtSortKey): T[] {
  return [...records].sort(SORTERS[sort] ?? SORTERS['date-desc'])
}

export function asWhtSort(v: string | null | undefined): WhtSortKey {
  return v && v in SORTERS ? (v as WhtSortKey) : 'date-desc'
}

/** Which way a click on this column should sort. Text ascending, figures/dates high. */
const ASC_DEFAULT: readonly WhtSortField[] = ['vendor', 'cert', 'form', 'status']
export function nextWhtSort(sort: WhtSortKey, field: WhtSortField): WhtSortKey {
  if (whtSortField(sort) !== field) {
    return `${field}-${ASC_DEFAULT.includes(field) ? 'asc' : 'desc'}` as WhtSortKey
  }
  return sort.endsWith('-asc') ? (`${field}-desc` as WhtSortKey) : (`${field}-asc` as WhtSortKey)
}
