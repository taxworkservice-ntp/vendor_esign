import { describe, expect, it } from 'vitest'
import { VENDOR_PREFIXES, isEntityName, isVendorPrefix, prefixRequired, vendorDisplayName } from './vendor-name'

describe('vendor name prefix', () => {
  it('offers the three personal titles', () => {
    expect(VENDOR_PREFIXES).toEqual(['นาย', 'นาง', 'นางสาว'])
    expect(isVendorPrefix('นาย')).toBe(true)
    expect(isVendorPrefix('นางสาว')).toBe(true)
    expect(isVendorPrefix('')).toBe(false)
    expect(isVendorPrefix('ด.ช.')).toBe(false)
  })

  it('treats juristic names as entities (prefix exempt)', () => {
    expect(isEntityName('บริษัท ซัพพลาย พลัส จำกัด')).toBe(true)
    expect(isEntityName('ร้าน วัสดุก่อสร้าง รุ่งเรือง')).toBe(true)
    expect(isEntityName('ห้างหุ้นส่วนจำกัด ก')).toBe(true)
    expect(isEntityName('สมชาย การช่าง')).toBe(false)
    expect(prefixRequired('สมชาย การช่าง')).toBe(true)
    expect(prefixRequired('บริษัท ซัพพลาย พลัส จำกัด')).toBe(false)
  })

  it('composes the display name and omits the space when prefix is empty', () => {
    expect(vendorDisplayName('นาย', 'สมชาย การช่าง')).toBe('นาย สมชาย การช่าง')
    expect(vendorDisplayName('', 'บริษัท ซัพพลาย พลัส จำกัด')).toBe('บริษัท ซัพพลาย พลัส จำกัด')
    expect(vendorDisplayName(undefined, 'มาลี ค้าส่ง')).toBe('มาลี ค้าส่ง')
  })
})
