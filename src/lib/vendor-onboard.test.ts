import { describe, expect, it } from 'vitest'
import { firstInvalidField, validateOnboard, type OnboardInput } from './vendor-onboard'

const valid: OnboardInput = {
  prefix: 'นาย',
  name: 'สมชาย ใจดี',
  address: '123 ถนนทดสอบ ตำบลทดสอบ',
  taxId: '1101700230708',
  bankName: 'กสิกรไทย',
  bankAccount: '1234567890',
  accountHolder: 'สมชาย ใจดี',
  hasIdDoc: true,
  consent: true,
}

describe('validateOnboard', () => {
  it('accepts a complete, valid submission', () => {
    expect(validateOnboard(valid)).toEqual({})
  })

  it('requires a title for individuals but not for entities', () => {
    expect(validateOnboard({ ...valid, prefix: '' }).prefix).toBeTruthy()
    const entity = { ...valid, prefix: '', name: 'บริษัท ทดสอบ จำกัด' }
    expect(validateOnboard(entity).prefix).toBeUndefined()
  })

  it('validates the tax ID length and checksum', () => {
    expect(validateOnboard({ ...valid, taxId: '110170023070' }).taxId).toContain('13 หลัก')
    expect(validateOnboard({ ...valid, taxId: '1101700230709' }).taxId).toContain('ไม่ถูกต้อง')
  })

  it('requires the ID photo and consent', () => {
    expect(validateOnboard({ ...valid, hasIdDoc: false }).idDoc).toBeTruthy()
    expect(validateOnboard({ ...valid, consent: false }).consent).toBeTruthy()
  })

  it('reports the first invalid field in visual order', () => {
    const errors = validateOnboard({ ...valid, name: '', consent: false })
    expect(firstInvalidField(errors)).toBe('name')
    expect(firstInvalidField({})).toBeNull()
  })
})
