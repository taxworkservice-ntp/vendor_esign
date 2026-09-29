import type { LineItem } from './types'

// Money + summary helpers shared by the form, lists, and both PDF renderers so
// the document total and the list text never drift.

const round2 = (n: number) => Math.round(n * 100) / 100

// Line total = quantity × unitPrice − discount (never below 0).
// Legacy items without qty/unitPrice fall back to their stored `amount`.
export function lineTotal(it: Partial<LineItem>): number {
  const qty = it.quantity != null ? Number(it.quantity) || 0 : 1
  const unitPrice = it.unitPrice != null ? Number(it.unitPrice) || 0 : Number(it.amount) || 0
  const discount = Number(it.discount) || 0
  return round2(Math.max(0, qty * unitPrice - discount))
}

// Fill defaults and recompute `amount`. Keeps optional fields absent when unset
// so legacy/simple items stay clean.
export function normalizeLineItem(raw: Partial<LineItem>): LineItem {
  const quantity = raw.quantity != null ? Number(raw.quantity) || 0 : 1
  const unitPrice = raw.unitPrice != null ? Number(raw.unitPrice) || 0 : Number(raw.amount) || 0
  const discount = Number(raw.discount) || 0
  const item: LineItem = { description: String(raw.description ?? '').trim(), amount: 0 }
  const unit = String(raw.unit ?? '').trim()
  if (unit) item.unit = unit
  item.quantity = quantity
  item.unitPrice = unitPrice
  if (discount) item.discount = discount
  item.amount = lineTotal(item)
  return item
}

export function itemsTotal(items: LineItem[]): number {
  return round2(items.reduce((s, it) => s + lineTotal(it), 0))
}

// Summary shown in lists/search: the note wins, else the first item + “และอื่น ๆ”.
export function itemsSummary(items: LineItem[], note?: string): string {
  const n = (note ?? '').trim()
  if (n) return n
  const named = items.filter((it) => it.description.trim())
  if (named.length === 0) return 'รายการ'
  if (named.length === 1) return named[0].description.trim()
  return `${named[0].description.trim()} และอื่น ๆ (${named.length} รายการ)`
}

export function hasItems(items: LineItem[] | undefined): items is LineItem[] {
  return !!items && items.some((it) => it.description.trim() && lineTotal(it) > 0)
}

// Stable key for grouping near-duplicate item descriptions across history:
// trim, collapse whitespace, NFC-normalize; latin case-folded, Thai preserved.
export function normalizeItemKey(description: string): string {
  return description
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
