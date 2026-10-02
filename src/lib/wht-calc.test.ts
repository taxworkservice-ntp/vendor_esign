import { describe, expect, it } from 'vitest'
import { applyWhtThreshold, belowWhtThreshold, calcWht, NO_WHT_PAYMENT_TYPE } from './wht-calc'

describe('calcWht', () => {
  it('withholds on the gross base in deduct mode', () => {
    expect(calcWht(1000, 3, 'deduct')).toEqual({ gross: 1000, wht: 30, net: 970 })
  })
})

describe('applyWhtThreshold (มาตรา 50/1)', () => {
  it('waives WHT below the threshold and reclassifies the type', () => {
    expect(applyWhtThreshold(500, 3, 'ค่าบริการ', 1000, false)).toEqual({
      rate: 0,
      paymentType: NO_WHT_PAYMENT_TYPE,
      noWht: true,
    })
  })

  it('keeps the rate at or above the threshold', () => {
    expect(applyWhtThreshold(1000, 3, 'ค่าบริการ', 1000, false)).toEqual({
      rate: 3,
      paymentType: 'ค่าบริการ',
      noWht: false,
    })
  })

  it('lets a continuous contract force withholding below the threshold', () => {
    expect(applyWhtThreshold(500, 3, 'ค่าบริการ', 1000, true)).toEqual({
      rate: 3,
      paymentType: 'ค่าบริการ',
      noWht: false,
    })
  })

  it('disables the rule when the threshold is 0', () => {
    expect(applyWhtThreshold(1, 3, 'ค่าบริการ', 0, false).rate).toBe(3)
  })

  it('never triggers on a zero gross', () => {
    expect(belowWhtThreshold(0, 1000)).toBe(false)
  })
})
