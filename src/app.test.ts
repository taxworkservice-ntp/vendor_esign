import { describe, expect, it } from 'vitest'
import { calcWht, isDuplicateSlipRef } from './lib/config'

describe('pilot money rules (UI slice)', () => {
  it('computes WHT + net live', () => {
    expect(calcWht(3000, 3)).toEqual({ wht: 90, net: 2910 })
    expect(calcWht(5000, 5)).toEqual({ wht: 250, net: 4750 })
  })
  it('rejects duplicate slip refs (case/space-insensitive)', () => {
    expect(isDuplicateSlipRef('TRF-881201', ['trf-881201 '])).toBe(true)
    expect(isDuplicateSlipRef('TRF-999', ['TRF-881201'])).toBe(false)
    expect(isDuplicateSlipRef('  ', ['TRF-1'])).toBe(false)
  })
})
