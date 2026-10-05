import { describe, expect, it } from 'vitest'
import { isDuplicateItemName, itemSearchFields, matchesSearch, normalizeSearch, vendorSearchFields } from './search-match'

describe('matchesSearch', () => {
  it('matches everything on an empty query', () => {
    expect(matchesSearch(['a'], '')).toBe(true)
    expect(matchesSearch(['a'], '   ')).toBe(true)
  })

  it('matches a substring, not just a prefix', () => {
    expect(matchesSearch(['สมชาย การช่าง'], 'ช่าง')).toBe(true)
  })

  it('folds case so latin input works either way', () => {
    expect(matchesSearch(['Somchai Co'], 'somchai')).toBe(true)
    expect(matchesSearch(['Somchai Co'], 'SOM')).toBe(true)
  })

  it('matches on any one of several fields', () => {
    expect(matchesSearch(['สมชาย', 'กรุงเทพ', '0812345678'], 'กรุงเทพ')).toBe(true)
    expect(matchesSearch(['สมชาย', 'กรุงเทพ', '0812345678'], '0812')).toBe(true)
  })

  it('ignores null and undefined rather than matching the string "null"', () => {
    expect(matchesSearch([undefined, null, ''], 'x')).toBe(false)
    expect(matchesSearch([undefined, null, 'abc'], 'a')).toBe(true)
  })

  it('matches numbers as text', () => {
    expect(matchesSearch([1234], '234')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesSearch(['สมชาย'], 'zzzz')).toBe(false)
  })
})

describe('normalizeSearch', () => {
  it('trims and lowercases', () => {
    expect(normalizeSearch('  AbC  ')).toBe('abc')
  })
})

describe('vendorSearchFields', () => {
  const v = {
    name: 'สมชาย การช่าง',
    address: '123/4 ถนนสุขุมวิท',
    phone: '081-234-5678',
    email: 'somchai@example.com',
    lineUserId: 'U1234567890',
    vendorNo: 7,
    taxLast4: '6789',
  }

  it('finds by name', () => {
    expect(matchesSearch(vendorSearchFields(v), 'การช่าง')).toBe(true)
  })

  it('finds by the last four digits of the tax ID', () => {
    // The whole reason the register is filtered client-side: the stored number
    // is encrypted at rest, so no server-side search can reach this.
    expect(matchesSearch(vendorSearchFields(v), '6789')).toBe(true)
  })

  it('finds by vendor number, padded, raw or as the displayed code', () => {
    expect(matchesSearch(vendorSearchFields(v), '007')).toBe(true)
    expect(matchesSearch(vendorSearchFields(v), '7')).toBe(true)
    expect(matchesSearch(vendorSearchFields(v), 'VEN-007')).toBe(true)
  })

  it('finds by phone, address, email and LINE id', () => {
    expect(matchesSearch(vendorSearchFields(v), '081')).toBe(true)
    expect(matchesSearch(vendorSearchFields(v), 'สุขุมวิท')).toBe(true)
    expect(matchesSearch(vendorSearchFields(v), 'example')).toBe(true)
    expect(matchesSearch(vendorSearchFields(v), 'U1234')).toBe(true)
  })

  it('tolerates a vendor with nothing but a name', () => {
    expect(matchesSearch(vendorSearchFields({ name: 'ก' }), 'ก')).toBe(true)
    expect(matchesSearch(vendorSearchFields({ name: 'ก' }), 'x')).toBe(false)
  })
})

describe('itemSearchFields', () => {
  it('searches the unit as well as the name', () => {
    expect(matchesSearch(itemSearchFields({ name: 'ค่าจ้าง', unit: 'ชั่วโมง' }), 'ชั่วโมง')).toBe(true)
    expect(matchesSearch(itemSearchFields({ name: 'ค่าจ้าง', unit: 'ชั่วโมง' }), 'ค่า')).toBe(true)
  })

  it('finds by item number, padded, raw or as the displayed code', () => {
    const it = { name: 'ค่าจ้าง', unit: 'ชั่วโมง', itemNo: 3 }
    expect(matchesSearch(itemSearchFields(it), 'ITM-003')).toBe(true)
    expect(matchesSearch(itemSearchFields(it), '003')).toBe(true)
    expect(matchesSearch(itemSearchFields(it), '3')).toBe(true)
  })
})

describe('isDuplicateItemName', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(isDuplicateItemName('Cleaning', 'cleaning')).toBe(true)
    expect(isDuplicateItemName('  Cleaning ', 'CLEANING')).toBe(true)
  })

  it('treats genuinely different names as distinct', () => {
    expect(isDuplicateItemName('Cleaning', 'Cleaning A')).toBe(false)
  })
})
