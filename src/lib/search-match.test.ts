import { describe, expect, it } from 'vitest'
import { isDuplicateItemName, itemSearchFields, matchesSearch, normalizeSearch, vendorMatches } from './search-match'

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

describe('vendorMatches (register + picker share this)', () => {
  const v = {
    prefix: 'นาย',
    name: 'สมชาย การช่าง',
    address: '123/4 ถนนสุขุมวิท',
    phone: '081-234-5678',
    email: 'somchai@example.com',
    lineUserId: 'U999000',
    vendorNo: 7,
    taxId: '12345678906789', // 13 digits, ends 6789
    bankAccount: '5555555',
    accountHolder: 'บัญชีพิเศษ',
  }

  it('finds by name, by the title alone, and combined', () => {
    expect(vendorMatches(v, 'การช่าง')).toBe(true)
    expect(vendorMatches(v, 'นาย')).toBe(true)
    expect(vendorMatches(v, 'นาย สมชาย')).toBe(true)
    expect(vendorMatches(v, 'นายสมชาย')).toBe(true)
  })

  it('finds by vendor number, padded, raw or as the displayed code', () => {
    expect(vendorMatches(v, '007')).toBe(true)
    expect(vendorMatches(v, '7')).toBe(true)
    expect(vendorMatches(v, 'VEN-007')).toBe(true)
  })

  it('finds by the FULL tax ID (digit-normalised) — last 4 included', () => {
    expect(vendorMatches(v, '6789')).toBe(true)
    expect(vendorMatches(v, '45678906789')).toBe(true)
    expect(vendorMatches(v, '1-2345-67890-67-89')).toBe(true)
  })

  it('finds by phone regardless of its formatting', () => {
    expect(vendorMatches(v, '081')).toBe(true)
    expect(vendorMatches(v, '0812345678')).toBe(true)
  })

  it('finds by address', () => {
    expect(vendorMatches(v, 'สุขุมวิท')).toBe(true)
  })

  it('does NOT search email, LINE id, bank account or account holder', () => {
    expect(vendorMatches(v, 'example')).toBe(false)
    expect(vendorMatches(v, 'U999000')).toBe(false)
    expect(vendorMatches(v, '5555555')).toBe(false)
    expect(vendorMatches(v, 'บัญชีพิเศษ')).toBe(false)
  })

  it('ignores a 1–2 digit query (no false hits from short numbers)', () => {
    expect(vendorMatches(v, '89')).toBe(false)
  })

  it('tolerates a vendor with nothing but a name', () => {
    expect(vendorMatches({ name: 'ก' }, 'ก')).toBe(true)
    expect(vendorMatches({ name: 'ก' }, 'x')).toBe(false)
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
