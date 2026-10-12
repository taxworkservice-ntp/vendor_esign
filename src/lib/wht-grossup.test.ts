import { describe, expect, it } from 'vitest'
import { grossForNet, scaleAmountsToTarget } from './wht-grossup'

describe('grossForNet', () => {
  it('grosses up so the vendor nets the requested amount', () => {
    // 1,000 net at 3% → gross 1,030.93
    expect(grossForNet(1000, 3)).toBe(1030.93)
  })

  it('returns the amount unchanged at 0%', () => {
    expect(grossForNet(1000, 0)).toBe(1000)
  })
})

describe('scaleAmountsToTarget', () => {
  it('scales proportionally and sums exactly to the target', () => {
    const out = scaleAmountsToTarget([500, 500], 1030.93)
    expect(out[0]).toBe(515.47)
    expect(out[1]).toBe(515.46) // last line absorbs the rounding residue
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1030.93, 2)
  })

  it('keeps relative proportions for unequal lines', () => {
    const out = scaleAmountsToTarget([300, 700], 1030.93)
    expect(out[0] / out[1]).toBeCloseTo(300 / 700, 3)
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1030.93, 2)
  })

  it('leaves zero lines at zero and returns input when nothing to scale', () => {
    expect(scaleAmountsToTarget([0, 0], 500)).toEqual([0, 0])
    expect(scaleAmountsToTarget([500], 500)).toEqual([500])
  })
})
