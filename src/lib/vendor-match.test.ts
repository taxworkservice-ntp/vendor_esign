import { describe, expect, it } from 'vitest'
import { matchesVendorQuery, vendorTaxIdMatches } from './vendor-match'

const vendor = {
  name: 'สมชาย ใจดี',
  address: '12 ม.4 ขอนแก่น 40000',
  taxId: '1234567890123',
  maskedId: 'x-xxxx-xxxxx-12-3',
}

describe('vendorTaxIdMatches', () => {
  it('matches regardless of formatting', () => {
    expect(vendorTaxIdMatches(vendor, '1-2345-67890-12-3')).toBe(true)
    expect(vendorTaxIdMatches(vendor, '1234567890123')).toBe(true)
  })
  it('rejects a different id', () => {
    expect(vendorTaxIdMatches(vendor, '9999999999999')).toBe(false)
  })
  it('returns null when the vendor has no registered id', () => {
    expect(vendorTaxIdMatches({}, '1234567890123')).toBeNull()
    expect(vendorTaxIdMatches(undefined, '1234567890123')).toBeNull()
  })
})

describe('matchesVendorQuery', () => {
  it('matches empty query', () => {
    expect(matchesVendorQuery(vendor, '')).toBe(true)
    expect(matchesVendorQuery(vendor, '   ')).toBe(true)
  })
  it('matches by name and address', () => {
    expect(matchesVendorQuery(vendor, 'สมชาย')).toBe(true)
    expect(matchesVendorQuery(vendor, 'ขอนแก่น')).toBe(true)
    expect(matchesVendorQuery(vendor, 'malee')).toBe(false)
  })
  it('matches by tax id digits', () => {
    expect(matchesVendorQuery(vendor, '5678')).toBe(true)
    expect(matchesVendorQuery(vendor, '9999')).toBe(false)
  })
})
