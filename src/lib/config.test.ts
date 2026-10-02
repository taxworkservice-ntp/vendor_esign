import { describe, expect, it } from 'vitest'
import { calcWht, whtRateForPaymentType } from './config'

describe('calcWht', () => {
  it('deduct: withholds from the amount', () => {
    expect(calcWht(5000, 3, 'deduct')).toEqual({ gross: 5000, wht: 150, net: 4850 })
    expect(calcWht(5000, 3)).toEqual({ gross: 5000, wht: 150, net: 4850 }) // default mode
    expect(calcWht(1200, 0)).toEqual({ gross: 1200, wht: 0, net: 1200 })
  })

  it('grossup: vendor nets the entered amount', () => {
    const r = calcWht(5000, 3, 'grossup')
    expect(r.net).toBe(5000)
    expect(r.gross).toBe(5154.64)
    expect(r.wht).toBe(154.64)
  })

  it('grossup falls back to deduct at 0% or >=100%', () => {
    expect(calcWht(5000, 0, 'grossup')).toEqual({ gross: 5000, wht: 0, net: 5000 })
    expect(calcWht(5000, 100, 'grossup')).toEqual({ gross: 5000, wht: 5000, net: 0 })
  })
})

describe('whtRateForPaymentType', () => {
  it('maps the Revenue Department preset payment types', () => {
    expect(whtRateForPaymentType('ค่าจ้างทำของ')).toBe(3)
    expect(whtRateForPaymentType('ค่าวิชาชีพอิสระ')).toBe(3)
    expect(whtRateForPaymentType('ค่าบริการ')).toBe(3)
    expect(whtRateForPaymentType('ค่าเช่าทรัพย์สิน')).toBe(5)
    expect(whtRateForPaymentType('ค่านายหน้า')).toBe(3)
    expect(whtRateForPaymentType('ค่าขนส่ง')).toBe(1)
    expect(whtRateForPaymentType('ไม่หักภาษี ณ ที่จ่าย')).toBe(0)
  })
  it('falls back to 0 for unknown types', () => {
    expect(whtRateForPaymentType('ไม่รู้จัก')).toBe(0)
    expect(whtRateForPaymentType('')).toBe(0)
  })
})
