import { describe, expect, it } from 'vitest'
import { itemsSummary, itemsTotal, lineTotal, normalizeLineItem } from './line-items'

describe('line items', () => {
  it('computes line total = qty × unitPrice − discount', () => {
    expect(lineTotal({ quantity: 2, unitPrice: 2500 })).toBe(5000)
    expect(lineTotal({ quantity: 3, unitPrice: 100, discount: 50 })).toBe(250)
    expect(lineTotal({ quantity: 1, unitPrice: 100, discount: 500 })).toBe(0) // never below 0
    expect(lineTotal({ amount: 1200 })).toBe(1200) // legacy
  })

  it('normalizes optional fields and recomputes amount', () => {
    expect(normalizeLineItem({ description: ' ค่าจ้าง ', amount: 1000 })).toEqual({
      description: 'ค่าจ้าง',
      quantity: 1,
      unitPrice: 1000,
      amount: 1000,
    })
    expect(normalizeLineItem({ description: 'x', unit: 'ชิ้น', quantity: 2, unitPrice: 50, discount: 10 })).toEqual({
      description: 'x',
      unit: 'ชิ้น',
      quantity: 2,
      unitPrice: 50,
      discount: 10,
      amount: 90,
    })
  })

  it('sums rounded line totals', () => {
    expect(itemsTotal([{ description: 'a', amount: 1000 }, { description: 'b', amount: 250.5 }])).toBe(1250.5)
    expect(itemsTotal([])).toBe(0)
  })

  it('summarizes: note > first item > count suffix', () => {
    const items = [{ description: 'ค่าจ้าง', amount: 1 }, { description: 'ค่าอะไหล่', amount: 1 }]
    expect(itemsSummary(items)).toBe('ค่าจ้าง และอื่น ๆ (2 รายการ)')
    expect(itemsSummary(items, 'งานซ่อม')).toBe('งานซ่อม')
    expect(itemsSummary([{ description: 'ค่าจ้าง', amount: 1 }])).toBe('ค่าจ้าง')
  })
})
