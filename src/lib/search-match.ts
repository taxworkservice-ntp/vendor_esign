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

/** Every field a vendor can be found by, in the order shown in the UI hint. */
export function vendorSearchFields(v: {
  name?: string
  address?: string
  phone?: string
  email?: string
  lineUserId?: string
  vendorNo?: number
  taxLast4?: string
  maskedId?: string
}): SearchField[] {
  // vendorNo is matched on its zero-padded form too, so "001" finds #001.
  const no = v.vendorNo ?? 0
  return [v.name, v.address, v.phone, v.email, v.lineUserId, String(no), String(no).padStart(3, '0'), v.taxLast4, v.maskedId]
}

/** Every field a catalog item can be found by. */
export function itemSearchFields(i: { name?: string; unit?: string }): SearchField[] {
  return [i.name, i.unit]
}

/** True when two catalog item names collide, ignoring case and surrounding space. */
export function isDuplicateItemName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
