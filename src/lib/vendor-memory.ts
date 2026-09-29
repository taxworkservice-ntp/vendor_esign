import type { LineItem, PaymentTransaction, WhtMode } from './types'
import { normalizeItemKey } from './line-items'

// Vendor memory is DERIVED from transaction history — never stored. This keeps
// a single source of truth (no drift), avoids an extra copy of any personal
// data, and removes write races. Deterministic so it is unit-testable.

export const MEMORY_STATUSES_EXCLUDED: readonly PaymentTransaction['status'][] = ['draft', 'void', 'cancelled']
export const MEMORY_CATALOG_LIMIT = 20

export interface VendorItemStat {
  description: string // display form (first seen, trimmed)
  lastAmount: number
  timesUsed: number
  lastUsedAt: string
}

export interface VendorLastUsed {
  lineItems: LineItem[]
  paymentType: string
  whtRate: number
  whtMode: WhtMode
  note: string
}

export interface VendorMemory {
  last: VendorLastUsed | null
  items: VendorItemStat[]
}

const EMPTY: VendorMemory = { last: null, items: [] }

function eligible(t: PaymentTransaction, vendorId: string): boolean {
  return t.vendor.id === vendorId && !MEMORY_STATUSES_EXCLUDED.includes(t.status)
}

function realItems(items: LineItem[] | undefined): LineItem[] {
  return (items ?? [])
    .map((it) => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
    .filter((it) => it.description && it.amount > 0)
}

// Items of a transaction, falling back to the legacy single line when needed.
function itemsOf(t: PaymentTransaction): LineItem[] {
  const items = realItems(t.lineItems)
  return items.length ? items : realItems([{ description: t.description, amount: t.grossAmount }])
}

// newest first, tiebreak id — deterministic ordering.
function byRecency(a: PaymentTransaction, b: PaymentTransaction): number {
  const d = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  return d !== 0 ? d : b.id.localeCompare(a.id)
}

export function buildVendorMemory(txns: PaymentTransaction[], vendorId: string): VendorMemory {
  const history = txns.filter((t) => eligible(t, vendorId)).sort(byRecency)
  if (history.length === 0) return EMPTY

  const newest = history[0]
  const last: VendorLastUsed = {
    lineItems: itemsOf(newest),
    paymentType: newest.paymentType,
    whtRate: Number(newest.whtRate) || 0,
    whtMode: newest.whtMode ?? 'deduct',
    note: (newest.note ?? '').trim(),
  }

  // Catalog: aggregate by normalized key across all eligible history.
  const byKey = new Map<string, VendorItemStat>()
  for (const t of history) {
    for (const it of itemsOf(t)) {
      const key = normalizeItemKey(it.description)
      if (!key) continue
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, { description: it.description, lastAmount: it.amount, timesUsed: 1, lastUsedAt: t.createdAt })
      } else {
        prev.timesUsed += 1
        // history is newest-first, so the first occurrence is the latest amount.
        if (t.createdAt > prev.lastUsedAt) {
          prev.lastUsedAt = t.createdAt
          prev.lastAmount = it.amount
        }
      }
    }
  }

  const items = [...byKey.values()]
    .sort((a, b) => b.timesUsed - a.timesUsed || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MEMORY_CATALOG_LIMIT)

  return { last, items }
}
