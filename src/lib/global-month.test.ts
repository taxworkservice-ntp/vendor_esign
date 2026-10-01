import { beforeEach, describe, expect, it } from 'vitest'
import { formatMonthTH, isValidMonth, monthHasData, monthPresets, monthRange, monthStorageKey, readStoredMonth, resolveMonth, shiftMonth, writeStoredMonth } from './global-month'

class LS {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

describe('global-month', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: LS }).localStorage = new LS()
  })

  it('validates YYYY-MM strictly', () => {
    expect(isValidMonth('2026-09')).toBe(true)
    expect(isValidMonth('2026-9')).toBe(false)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-00')).toBe(false)
    expect(isValidMonth('26-09')).toBe(false)
    expect(isValidMonth('')).toBe(false)
    expect(isValidMonth(null)).toBe(false)
    expect(isValidMonth(undefined)).toBe(false)
    expect(isValidMonth('2026-09-01')).toBe(false)
  })

  it('scopes storage keys per tenant', () => {
    expect(monthStorageKey('ABC')).toBe('tw:global-month:ABC')
    expect(monthStorageKey('XYZ')).toBe('tw:global-month:XYZ')
    expect(monthStorageKey('ABC')).not.toBe(monthStorageKey('XYZ'))
  })

  it('persists and reads the last pick per tenant', () => {
    writeStoredMonth('ABC', '2026-08')
    writeStoredMonth('XYZ', '2026-09')
    expect(readStoredMonth('ABC')).toBe('2026-08')
    expect(readStoredMonth('XYZ')).toBe('2026-09')
  })

  it('preserves an explicit all-time pick', () => {
    writeStoredMonth('ABC', '')
    expect(readStoredMonth('ABC')).toBe('')
  })

  it('treats corrupt storage as absent and never writes invalid', () => {
    localStorage.setItem(monthStorageKey('ABC'), 'not-a-month')
    expect(readStoredMonth('ABC')).toBe(null)
    writeStoredMonth('ABC', 'bogus')
    expect(localStorage.getItem(monthStorageKey('ABC'))).toBe('not-a-month')
  })

  it('resolves URL > storage > current month', () => {
    const today = new Date(2026, 8, 29) // 2026-09-29
    expect(resolveMonth({ tenantId: 'ABC', today })).toBe('2026-09')
    writeStoredMonth('ABC', '2026-07')
    expect(resolveMonth({ tenantId: 'ABC', today })).toBe('2026-07')
    expect(resolveMonth({ urlMonth: '2026-05', tenantId: 'ABC', today })).toBe('2026-05')
    // invalid URL never wins, never throws — falls back to storage
    expect(resolveMonth({ urlMonth: 'oops', tenantId: 'ABC', today })).toBe('2026-07')
    // stored all-time is honored, not replaced by current month
    writeStoredMonth('ABC', '')
    expect(resolveMonth({ tenantId: 'ABC', today })).toBe('')
  })

  it('computes inclusive month ranges across year boundaries', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2025-12')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(() => monthRange('bogus')).toThrow('invalid-month')
  })

  it('formats Thai month labels with Buddhist year', () => {
    expect(formatMonthTH('2026-09')).toBe('ก.ย. 2569')
    expect(formatMonthTH('2025-12')).toBe('ธ.ค. 2568')
    expect(formatMonthTH('bogus')).toBe('bogus')
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-09', -1)).toBe('2026-08')
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-09', -12)).toBe('2025-09')
    expect(shiftMonth('2026-09', 0)).toBe('2026-09')
    expect(() => shiftMonth('bogus', 1)).toThrow('invalid-month')
  })

  it('offers a rolling window so an empty month is still selectable', () => {
    // The regression this replaces: only data-bearing months were listed, so a
    // legitimate empty period could not be chosen and the control looked dead.
    const out = monthPresets(['2026-09'], '2026-10', 3)
    expect(out).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
    // The current month is always present — it is "home".
    expect(monthPresets([], '2026-10', 2)).toEqual(['2026-10', '2026-09', '2026-08'])
  })

  it('extends beyond the window for a workspace with old history', () => {
    const out = monthPresets(['2023-01'], '2026-10', 3)
    expect(out).toContain('2023-01')
    expect(out[0]).toBe('2026-10')
  })

  it('excludes future and malformed months from presets', () => {
    const out = monthPresets(['2026-11', 'bogus', ''], '2026-10', 1)
    expect(out).toEqual(['2026-10', '2026-09'])
    expect(out.every(isValidMonth)).toBe(true)
  })

  it('never offers a future month, even with a wide window', () => {
    const out = monthPresets(['2026-11', '2027-01'], '2026-10', 12)
    expect(out).not.toContain('2026-11')
    expect(out).not.toContain('2027-01')
    expect(out[0]).toBe('2026-10')
  })

  it('marks which periods actually hold transactions', () => {
    const data = ['2026-09']
    expect(monthHasData('2026-09', data)).toBe(true)
    expect(monthHasData('2026-08', data)).toBe(false)
  })
})
