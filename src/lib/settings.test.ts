import { describe, expect, it } from 'vitest'
import { defaultSettings, validateSettings, whtRateFor } from './settings'

describe('settings', () => {
  it('defaults seed from the current config + client profile', () => {
    const s = defaultSettings('ABC')
    expect(s.clientCode).toBe('ABC')
    expect(s.paymentTypes.length).toBeGreaterThan(0)
    expect(s.whtMinThreshold).toBe(1000)
    expect(s.linkExpiryDays).toBe(7)
  })

  it('validates required clientCode + taxId + positive values', () => {
    const base = defaultSettings('ABC')
    expect(validateSettings(base)).toBeNull()

    expect(validateSettings({ ...base, clientCode: 'a' })).toMatch(/รหัสลูกค้า/)
    expect(validateSettings({ ...base, clientCode: 'AB' })).toBeNull()
    expect(validateSettings({ ...base, displayName: '' })).toMatch(/ชื่อบริษัท/)
    expect(validateSettings({ ...base, taxId: '123' })).toMatch(/13 หลัก/)
    expect(validateSettings({ ...base, whtMinThreshold: -1 })).toMatch(/ขั้นต่ำ/)
    expect(validateSettings({ ...base, whtMinThreshold: 0 })).toBeNull()
    expect(validateSettings({ ...base, linkExpiryDays: 0 })).toMatch(/อายุลิงก์/)
    expect(validateSettings({ ...base, whtRates: [{ paymentType: 'x', value: -1, label: '' }] })).toMatch(/WHT/)
  })

  it('resolves WHT rate by payment type', () => {
    const s = defaultSettings('ABC')
    expect(whtRateFor('ค่าบริการ', s)).toBe(3)
    expect(whtRateFor('ไม่รู้จัก', s)).toBe(0)
  })

  it('consent version discipline: text change without a version bump is rejected', () => {
    const base = defaultSettings('ABC')
    // Untouched text passes even with the same version (grandfathered).
    expect(validateSettings(base, base)).toBeNull()
    // Edited wording with the same version is rejected.
    expect(validateSettings({ ...base, consentTextV1: 'ข้อความใหม่ {{client}} {{amount}} {{date}} {{ref}} {{version}}' }, base))
      .toMatch(/เวอร์ชัน/)
    // Bumped version but dropped variables is rejected too.
    expect(validateSettings({ ...base, consentTextV1: 'ข้อความใหม่', consentVersion: '3' }, base))
      .toMatch(/ตัวแปร/)
    // Bumped version with all variables passes.
    expect(validateSettings(
      { ...base, consentTextV1: 'ข้อความใหม่ {{client}} {{amount}} {{date}} {{ref}} {{version}}', consentVersion: '3' },
      base,
    )).toBeNull()
  })
})
