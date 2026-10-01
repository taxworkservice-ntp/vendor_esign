import { describe, expect, it } from 'vitest'
import { parseMonthParam } from './month'

describe('parseMonthParam', () => {
  it('returns null for absent month (all time)', () => {
    expect(parseMonthParam(undefined)).toBe(null)
    expect(parseMonthParam(null)).toBe(null)
    expect(parseMonthParam('')).toBe(null)
  })

  it('returns inclusive ranges for valid months', () => {
    expect(parseMonthParam('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(parseMonthParam('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(parseMonthParam('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(parseMonthParam('2025-12')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('rejects malformed values instead of widening the query', () => {
    for (const bad of ['2026-13', '2026-00', '2026-9', '26-09', '2026-09-01', 'oops', '2026-09;DROP']) {
      expect(parseMonthParam(bad)).toEqual({ error: 'invalid-month' })
    }
  })
})
