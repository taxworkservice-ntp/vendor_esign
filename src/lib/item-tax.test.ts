import { describe, expect, it } from 'vitest'
import { cleanSubNotes, resolveTransactionTax, subNotesSubset } from './item-tax'

describe('resolveTransactionTax', () => {
  it('resolves a single type, uniform or lone', () => {
    expect(resolveTransactionTax([{ paymentType: 'ค่าบริการ' }]))
      .toEqual({ ok: true, paymentType: 'ค่าบริการ' })
    expect(resolveTransactionTax([{ paymentType: 'ค่าขนส่ง' }, { paymentType: 'ค่าขนส่ง' }]))
      .toEqual({ ok: true, paymentType: 'ค่าขนส่ง' })
  })

  it('blocks mixed types and missing tax distinctly', () => {
    expect(resolveTransactionTax([{ paymentType: 'ค่าบริการ' }, { paymentType: 'ค่าขนส่ง' }]))
      .toEqual({ ok: false, error: 'mixed-tax-types' })
    expect(resolveTransactionTax([{ paymentType: '' }, { paymentType: null }]))
      .toEqual({ ok: false, error: 'missing-item-tax' })
    expect(resolveTransactionTax([])).toEqual({ ok: false, error: 'no-items' })
  })
})

describe('subNotesSubset', () => {
  const defined = ['ด้านหน้า', 'ด้านหลัง', 'ด้านหลังอาคาร']
  it('accepts empty selections and exact subsets', () => {
    expect(subNotesSubset([], defined)).toBe(true)
    expect(subNotesSubset(undefined, defined)).toBe(true)
    expect(subNotesSubset(['ด้านหน้า', 'ด้านหลัง'], defined)).toBe(true)
  })

  it('rejects invented notes', () => {
    expect(subNotesSubset(['ด้านหน้า', 'ดาดฟ้า'], defined)).toBe(false)
    expect(subNotesSubset(['anything'], [])).toBe(false)
  })
})

describe('cleanSubNotes', () => {
  it('trims, drops empties/dupes, caps size', () => {
    expect(cleanSubNotes(['  ด้านหน้า ', '', 'ด้านหน้า', 42, null])).toEqual(['ด้านหน้า'])
    expect(cleanSubNotes('nope')).toEqual([])
    expect(cleanSubNotes(undefined)).toEqual([])
    const many = Array.from({ length: 15 }, (_, i) => `ข้อ ${i}`)
    expect(cleanSubNotes(many)).toHaveLength(10)
    expect(cleanSubNotes(['x'.repeat(200)], 10, 120)).toEqual(['x'.repeat(120)])
  })
})
