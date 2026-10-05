import { describe, expect, it } from 'vitest'
import { compareValues, sortRows, type SortAccessor } from './sort'

interface Row {
  id: string
  name: string
  n?: number | null
}

const rows: Row[] = [
  { id: 'a', name: 'ข', n: 10 },
  { id: 'b', name: 'ก', n: 2 },
  { id: 'c', name: 'ค', n: null },
]

const ACCESSORS: Record<string, SortAccessor<Row>> = {
  name: (r) => r.name,
  n: (r) => r.n,
}

describe('compareValues', () => {
  it('collates Thai correctly', () => {
    expect(compareValues('ก', 'ข')).toBeLessThan(0)
  })

  it('is numeric-aware for strings', () => {
    expect(compareValues('item 2', 'item 10')).toBeLessThan(0)
  })

  it('sorts null/empty last', () => {
    expect(compareValues(null, 'x')).toBeGreaterThan(0)
    expect(compareValues('x', null)).toBeLessThan(0)
    expect(compareValues(null, null)).toBe(0)
  })
})

describe('sortRows', () => {
  it('returns the input untouched when no key is set', () => {
    expect(sortRows(rows, null, 'asc', ACCESSORS)).toBe(rows)
  })

  it('sorts Thai ascending', () => {
    expect(sortRows(rows, 'name', 'asc', ACCESSORS).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts numerically descending, nulls last', () => {
    expect(sortRows(rows, 'n', 'desc', ACCESSORS).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps nulls last in ascending too', () => {
    expect(sortRows(rows, 'n', 'asc', ACCESSORS).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('does not mutate the source', () => {
    const snapshot = rows.map((r) => r.id)
    sortRows(rows, 'name', 'asc', ACCESSORS)
    expect(rows.map((r) => r.id)).toEqual(snapshot)
  })
})
