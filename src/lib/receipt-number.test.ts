import { describe, expect, it } from 'vitest'
import { formatReceiptNumber, nextReceiptNumber, vendorReceiptPrefix } from './receipt-number'

describe('receipt-number (per vendor)', () => {
  it('formats RCT-{VENDORNO}-{BE_YEAR}-{SEQ} with 3 digits', () => {
    expect(formatReceiptNumber(1, 2569, 1)).toBe('RCT-001-2569-001')
    expect(formatReceiptNumber(12, 2569, 42)).toBe('RCT-012-2569-042')
    expect(vendorReceiptPrefix(3, 2569)).toBe('RCT-003-2569-')
  })

  it('keeps a separate running book per vendor', () => {
    const existing = [
      'RCT-001-2569-001', 'RCT-001-2569-002', // vendor 1 → next 003
      'RCT-002-2569-001', // vendor 2 → next 002
      'RCT-009-2568-005', undefined,
    ]
    expect(nextReceiptNumber(1, 2569, existing)).toBe('RCT-001-2569-003')
    expect(nextReceiptNumber(2, 2569, existing)).toBe('RCT-002-2569-002')
    // a brand-new vendor starts at 001
    expect(nextReceiptNumber(7, 2569, existing)).toBe('RCT-007-2569-001')
    // different year → starts at 001 for each vendor
    expect(nextReceiptNumber(1, 2570, existing)).toBe('RCT-001-2570-001')
    // no history → 001
    expect(nextReceiptNumber(1, 2569, [])).toBe('RCT-001-2569-001')
  })
})
