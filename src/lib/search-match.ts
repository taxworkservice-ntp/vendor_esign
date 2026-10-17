// Substring matching for the client-side registries (vendors, items).
//
// The transaction list and the WHT register search server-side, where a
// whitelisted builder does the filtering. Vendors and items are different: they
// are small bounded lists (a supplier register, a service catalogue), so they
// are fetched whole and filtered here. That is also the only way to search the
// last 4 digits of a tax ID, because the stored number is encrypted at rest and
// has no indexed column.
//
// Kept in one place so the mock and server paths cannot drift on what counts as
// a match — the server builder uses the same escaping rules via
// server/src/sql-builder.ts.

import { itemCode, vendorCode } from './ids'

export type SearchField = string | number | null | undefined

export function normalizeSearch(q: string): string {
  return q.trim().toLowerCase()
}

/** True when any field contains the needle. An empty query matches everything. */
export function matchesSearch(fields: SearchField[], q: string): boolean {
  const needle = normalizeSearch(q)
  if (!needle) return true
  return fields.some((f) => {
    if (f === null || f === undefined) return false
    return String(f).toLowerCase().includes(needle)
  })
}

/** Digits only, so a phone/bank/tax input matches regardless of formatting. */
const digitsOnly = (s: SearchField): string => String(s ?? '').replace(/\D/g, '')

export interface VendorMatchable {
  prefix?: string
  name?: string
  address?: string
  vendorNo?: number
  /** The FULL tax ID (the client payload carries it, decrypted). */
  taxId?: string
  phone?: string
}

/**
 * The one vendor search used by both the register and the transaction-form
 * picker, so they cannot drift. Name (with/without prefix), vendor code and
 * address match as substrings; the numeric fields (full tax ID, phone) match
 * digits-only so "0812345678" finds "081-234-5678". The full tax ID is searched
 * — the register is filtered client-side on a payload that already carries it,
 * and the last 4 digits are a substring of it.
 *
 * Deliberately NOT searched: email, LINE id, bank account, account holder
 * (noisy for a quick lookup). An empty query matches everything.
 */
export function vendorMatches(v: VendorMatchable, q: string): boolean {
  const needle = normalizeSearch(q)
  if (!needle) return true
  const pfx = v.prefix ?? ''
  const name = v.name ?? ''
  const no = v.vendorNo ?? 0
  const text: SearchField[] = [
    pfx,
    name,
    pfx ? `${pfx} ${name}` : '',
    pfx ? `${pfx}${name}` : '',
    v.address,
    String(no),
    String(no).padStart(3, '0'),
    vendorCode(no),
  ]
  if (text.some((t) => t && String(t).toLowerCase().includes(needle))) return true
  const d = digitsOnly(q)
  if (d.length >= 3) {
    if (digitsOnly(v.taxId).includes(d)) return true
    if (digitsOnly(v.phone).includes(d)) return true
  }
  return false
}

/** Every field a catalog item can be found by. */
export function itemSearchFields(i: { name?: string; unit?: string; itemNo?: number }): SearchField[] {
  const no = i.itemNo ?? 0
  return [i.name, i.unit, String(no), String(no).padStart(3, '0'), itemCode(no)]
}

/** True when two catalog item names collide, ignoring case and surrounding space. */
export function isDuplicateItemName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
