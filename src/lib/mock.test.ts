import { describe, expect, it } from 'vitest'
import { SEED_TXNS } from './mock'
import { mockReceiptNumber } from './receipt'

describe('multi-client mock seed', () => {
  it('tags every seeded transaction with a tenant', () => {
    const abc = SEED_TXNS.filter((t) => t.tenantId === 'ABC')
    const demo = SEED_TXNS.filter((t) => t.tenantId === 'DEMO')
    expect(abc.length).toBeGreaterThan(0)
    expect(demo.length).toBeGreaterThan(0)
    expect(SEED_TXNS.every((t) => t.tenantId === 'ABC' || t.tenantId === 'DEMO')).toBe(true)
  })

  it('does not mix vendors across tenants', () => {
    const demoVendorIds = new Set(SEED_TXNS.filter((t) => t.tenantId === 'DEMO').map((t) => t.vendor.id))
    expect(SEED_TXNS.filter((t) => t.tenantId === 'ABC').some((t) => demoVendorIds.has(t.vendor.id))).toBe(false)
  })

  it('derives a per-vendor receipt series', () => {
    expect(mockReceiptNumber('TX-1041', 2).startsWith('RCT-002-2569-')).toBe(true)
    expect(mockReceiptNumber('DM-2002', 2).startsWith('RCT-002-2569-')).toBe(true)
  })
})
