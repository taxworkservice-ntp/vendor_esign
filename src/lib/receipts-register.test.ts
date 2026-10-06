import { describe, expect, it } from 'vitest'
import {
  asReceiptSort,
  nextReceiptSort,
  receiptQueryToParams,
  receiptSortDir,
  receiptSortField,
} from './receipts-register'

describe('receipt register sort', () => {
  it('parses field and direction', () => {
    expect(receiptSortField('vendor-asc')).toBe('vendor')
    expect(receiptSortDir('vendor-asc')).toBe('asc')
    expect(receiptSortField('gross-desc')).toBe('gross')
    expect(receiptSortDir('gross-desc')).toBe('desc')
  })

  it('a new column starts at its most useful direction', () => {
    expect(nextReceiptSort('date-desc', 'number')).toBe('number-asc')
    expect(nextReceiptSort('date-desc', 'vendor')).toBe('vendor-asc')
    expect(nextReceiptSort('date-desc', 'gross')).toBe('gross-desc')
    expect(nextReceiptSort('date-desc', 'date')).toBe('date-asc')
  })

  it('toggles direction on the active column', () => {
    expect(nextReceiptSort('number-asc', 'number')).toBe('number-desc')
    expect(nextReceiptSort('gross-desc', 'gross')).toBe('gross-asc')
  })

  it('falls back to date-desc for an unknown sort', () => {
    expect(asReceiptSort('nope')).toBe('date-desc')
    expect(asReceiptSort(null)).toBe('date-desc')
    expect(asReceiptSort('net-asc')).toBe('net-asc')
  })
})

describe('receiptQueryToParams', () => {
  it('omits defaults and keeps the rest', () => {
    const p = receiptQueryToParams({ month: '2026-10', q: 'rct', sort: 'vendor-asc', limit: 0, offset: 50 })
    expect(p.get('month')).toBe('2026-10')
    expect(p.get('q')).toBe('rct')
    expect(p.get('sort')).toBe('vendor-asc')
    expect(p.get('limit')).toBe('0')
    expect(p.get('offset')).toBe('50')
  })
})
