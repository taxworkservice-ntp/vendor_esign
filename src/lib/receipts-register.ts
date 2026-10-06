import { apiGet, hasServer } from './api-client'
import { loadTxns } from './mock'
import { monthRange } from './global-month'
import type { PaymentTransaction } from './types'

// Client receipt register: one row per issued receipt, scoped by the PAYMENT
// date (the receipt's accounting period), so the transaction, its receipt and
// its WHT all fall in the same period. The real issuance date is carried
// separately as `issueDate` and shown as "ออกเมื่อ".

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
}

export interface ReceiptRegisterSummary {
  count: number
  gross: number
  wht: number
  net: number
}

export interface ReceiptRegisterQuery {
  month: string
  q: string
  sort: ReceiptSortKey
  limit: number
  offset: number
}

export const RECEIPT_SORT_FIELDS = ['date', 'number', 'vendor', 'gross', 'wht', 'net'] as const
export type ReceiptSortField = (typeof RECEIPT_SORT_FIELDS)[number]
export type ReceiptSortKey = `${ReceiptSortField}-${'asc' | 'desc'}`

export function receiptSortField(key: ReceiptSortKey): ReceiptSortField {
  const f = key.split('-')[0]
  return (RECEIPT_SORT_FIELDS as readonly string[]).includes(f) ? (f as ReceiptSortField) : 'date'
}

export function receiptSortDir(key: ReceiptSortKey): 'asc' | 'desc' {
  return key.endsWith('-asc') ? 'asc' : 'desc'
}

/** Text columns start ascending, dates/amounts descending. */
const ASC_DEFAULT: readonly ReceiptSortField[] = ['number', 'vendor']
export function nextReceiptSort(current: ReceiptSortKey, field: ReceiptSortField): ReceiptSortKey {
  if (receiptSortField(current) !== field) {
    return `${field}-${ASC_DEFAULT.includes(field) ? 'asc' : 'desc'}` as ReceiptSortKey
  }
  return receiptSortDir(current) === 'asc' ? (`${field}-desc` as ReceiptSortKey) : (`${field}-asc` as ReceiptSortKey)
}

export function asReceiptSort(v: string | null | undefined): ReceiptSortKey {
  const key = (v ?? '') as ReceiptSortKey
  return RECEIPT_SORT_FIELDS.includes(receiptSortField(key)) && /-(asc|desc)$/.test(v ?? '')
    ? key
    : 'date-desc'
}

export function receiptQueryToParams(q: ReceiptRegisterQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (q.month) p.set('month', q.month)
  if (q.q) p.set('q', q.q)
  if (q.sort !== 'date-desc') p.set('sort', q.sort)
  if (q.limit !== 50) p.set('limit', String(q.limit))
  if (q.offset) p.set('offset', String(q.offset))
  return p
}

function rowFromTxn(t: PaymentTransaction): ReceiptRegisterRow {
  return {
    id: t.id,
    number: t.receiptNumber ?? '',
    issueDate: t.transferDate,
    transferDate: t.transferDate,
    verificationCode: t.verificationCode,
    vendorPrefix: t.vendor.prefix,
    vendorName: t.vendor.name,
    grossAmount: t.grossAmount,
    whtRate: t.whtRate,
    whtAmount: t.whtAmount,
    netAmount: t.netAmount,
  }
}

function sortRows(rows: ReceiptRegisterRow[], sort: ReceiptSortKey): ReceiptRegisterRow[] {
  const field = receiptSortField(sort)
  const dir = receiptSortDir(sort)
  const cmpStr = (a: string, b: string) => a.localeCompare(b, 'th', { numeric: true })
  const out = [...rows].sort((a, b) => {
    let c = 0
    switch (field) {
      case 'number': c = cmpStr(a.number, b.number); break
      case 'vendor': c = cmpStr(a.vendorName ?? '', b.vendorName ?? ''); break
      case 'gross': c = a.grossAmount - b.grossAmount; break
      case 'wht': c = a.whtAmount - b.whtAmount; break
      case 'net': c = a.netAmount - b.netAmount; break
      case 'date':
      default: c = cmpStr(a.issueDate, b.issueDate); break
    }
    return dir === 'asc' ? c : -c
  })
  return out
}

function summarize(rows: ReceiptRegisterRow[]): ReceiptRegisterSummary {
  return rows.reduce(
    (s, r) => ({ count: s.count + 1, gross: s.gross + r.grossAmount, wht: s.wht + r.whtAmount, net: s.net + r.netAmount }),
    { count: 0, gross: 0, wht: 0, net: 0 },
  )
}

export async function fetchReceiptRegister(
  activeTenant: string,
  q: ReceiptRegisterQuery,
): Promise<{ receipts: ReceiptRegisterRow[]; total: number; summary: ReceiptRegisterSummary }> {
  if (hasServer) {
    return apiGet<{ receipts: ReceiptRegisterRow[]; total: number; summary: ReceiptRegisterSummary }>(
      `/api/client/receipts?${receiptQueryToParams(q).toString()}`,
    )
  }
  // Mock: issued rows only, month by transfer date (the mock has no issue date).
  const range = q.month ? monthRange(q.month) : null
  const needle = q.q.trim().toLowerCase()
  const filtered = loadTxns()
    .filter((t) => t.tenantId === activeTenant)
    .filter((t) => t.status === 'issued' && !!t.receiptNumber)
    .filter((t) => (range ? t.transferDate >= range.from && t.transferDate <= range.to : true))
    .filter((t) =>
      needle
        ? (t.receiptNumber ?? '').toLowerCase().includes(needle) || t.vendor.name.toLowerCase().includes(needle)
        : true,
    )
    .map(rowFromTxn)
  const sorted = sortRows(filtered, q.sort)
  const page = q.limit > 0 ? sorted.slice(q.offset, q.offset + q.limit) : sorted
  return { receipts: page, total: sorted.length, summary: summarize(sorted) }
}
