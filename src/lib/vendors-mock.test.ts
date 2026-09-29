import { describe, expect, it } from 'vitest'
import { loadVendors, maskFromLast4 } from './vendors-mock'

describe('client vendors directory', () => {
  it('seeds ABC vendors as non-VAT receipt-eligible', () => {
    const all = loadVendors('ABC')
    expect(all.length).toBeGreaterThanOrEqual(3)
    expect(all.every((v) => v.tenantId === 'ABC')).toBe(true)
  })
  it('seeds a separate DEMO test client with its own vendors', () => {
    const demo = loadVendors('DEMO')
    expect(demo.length).toBeGreaterThanOrEqual(3)
    expect(demo.every((v) => v.tenantId === 'DEMO')).toBe(true)
    expect(loadVendors('ABC').some((v) => v.tenantId === 'DEMO')).toBe(false)
  })
  it('masks last-4 for display', () => {
    expect(maskFromLast4('1234')).toBe('x-xxxx-xxxxx-12-34')
    expect(maskFromLast4('')).toContain('x-xxxx')
  })
})
