import { describe, expect, it } from 'vitest'
import { fmtCode, itemCode, vendorCode } from './ids'

describe('fmtCode', () => {
  it('prefixes and zero-pads to three digits', () => {
    expect(fmtCode('VEN', 1)).toBe('VEN-001')
    expect(fmtCode('ITM', 42)).toBe('ITM-042')
  })

  it('grows past three digits without truncating', () => {
    expect(fmtCode('ITM', 1234)).toBe('ITM-1234')
  })

  it('treats null/undefined/negative as zero', () => {
    expect(fmtCode('VEN', null)).toBe('VEN-000')
    expect(fmtCode('VEN', undefined)).toBe('VEN-000')
    expect(fmtCode('VEN', -5)).toBe('VEN-000')
  })
})

describe('registry codes', () => {
  it('formats vendors and items', () => {
    expect(vendorCode(7)).toBe('VEN-007')
    expect(itemCode(3)).toBe('ITM-003')
  })
})
