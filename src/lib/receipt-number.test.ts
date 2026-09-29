import { describe, expect, it } from 'vitest'
import { formatReceiptNumber, nextReceiptNumber, receiptPrefix } from './receipt-number'

describe('receipt-number', () => {
  it('formats {CODE}-R-{BE_YEAR}-{NNN} with 3 digits', () => {
    expect(formatReceiptNumber('ABC', 2569, 1)).toBe('ABC-R-2569-001')
    expect(formatReceiptNumber('ABC', 2569, 42)).toBe('ABC-R-2569-042')
    expect(receiptPrefix('DEMO', 2569)).toBe('DEMO-R-2569-')
  })

  it('picks the next number from existing ones (per tenant/year)', () => {
    const existing = ['ABC-R-2569-001', 'ABC-R-2569-002', 'DEMO-R-2569-009', undefined]
    expect(nextReceiptNumber('ABC', 2569, existing)).toBe('ABC-R-2569-003')
    expect(nextReceiptNumber('DEMO', 2569, existing)).toBe('DEMO-R-2569-010')
    // different year → starts at 001
    expect(nextReceiptNumber('ABC', 2570, existing)).toBe('ABC-R-2570-001')
    // no history → 001
    expect(nextReceiptNumber('ABC', 2569, [])).toBe('ABC-R-2569-001')
  })
})
