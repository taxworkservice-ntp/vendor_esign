// Generic column sorting for the app's tables, kept in one place so every table
// orders the same way: Thai-aware collation, numeric-aware ("item 2" before
// "item 10"), and null/empty values last in both directions.

export type SortDir = 'asc' | 'desc'
export type SortValue = string | number | boolean | null | undefined
export type SortAccessor<T> = (row: T) => SortValue

/** Thai collation, numeric-aware, nulls last. */
export function compareValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'th', { numeric: true, sensitivity: 'base' })
}

/**
 * Sort a copy of `rows` by the accessor named `key`. Returns `rows` unchanged when
 * no key is set, so callers can pass `null` for "unsorted".
 */
export function sortRows<T>(
  rows: T[],
  key: string | null,
  dir: SortDir,
  accessors: Record<string, SortAccessor<T>>,
): T[] {
  const get = key ? accessors[key] : undefined
  if (!get) return rows
  return [...rows].sort((a, b) => {
    const av = get(a)
    const bv = get(b)
    // Nulls/empties always sort last, whichever direction is active.
    if (av == null || bv == null) {
      if (av == null && bv == null) return 0
      return av == null ? 1 : -1
    }
    const c = compareValues(av, bv)
    return dir === 'asc' ? c : -c
  })
}
