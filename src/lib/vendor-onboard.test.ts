import { describe, expect, it } from 'vitest'
import { firstInvalidField, onboardRef, validateOnboard, type OnboardInput } from './vendor-onboard'

const valid: OnboardInput = {
  prefix: 'นาย',
  name: 'สมชาย ใจดี',
  address: '123 ถนนทดสอบ ตำบลทดสอบ',
  phone: '0812345678',
  email: 'somchai@example.com',
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

  it('requires a title prefix on onboarding (person-centric form)', () => {
    expect(validateOnboard({ ...valid, prefix: '' }).prefix).toBeTruthy()
    expect(validateOnboard({ ...valid, prefix: 'คุณ' }).prefix).toBeTruthy()
    const entity = { ...valid, prefix: '', name: 'บริษัท ทดสอบ จำกัด' }
    expect(validateOnboard(entity).prefix).toBeTruthy()
  })

  it('validates the tax ID length and checksum', () => {
    expect(validateOnboard({ ...valid, taxId: '110170023070' }).taxId).toContain('13 หลัก')
    expect(validateOnboard({ ...valid, taxId: '1101700230709' }).taxId).toContain('ไม่ถูกต้อง')
  })

  it('requires the ID photo and consent', () => {
    expect(validateOnboard({ ...valid, hasIdDoc: false }).idDoc).toBeTruthy()
    expect(validateOnboard({ ...valid, consent: false }).consent).toBeTruthy()
  })

  it('requires a valid phone and email', () => {
    expect(validateOnboard({ ...valid, phone: '' }).phone).toBeTruthy()
    expect(validateOnboard({ ...valid, phone: '08123456' }).phone).toBeTruthy()
    expect(validateOnboard({ ...valid, phone: '+66812345678' }).phone).toBeTruthy()
    expect(validateOnboard({ ...valid, phone: '021234567' }).phone).toBeUndefined()
    expect(validateOnboard({ ...valid, email: '' }).email).toBeTruthy()
    expect(validateOnboard({ ...valid, email: 'not-an-email' }).email).toBeTruthy()
    expect(validateOnboard({ ...valid, email: 'a@b.co.th' }).email).toBeUndefined()
  })

  it('reports the first invalid field in visual order', () => {
    const errors = validateOnboard({ ...valid, name: '', consent: false })
    expect(firstInvalidField(errors)).toBe('name')
    expect(firstInvalidField(validateOnboard({ ...valid, phone: '' }))).toBe('phone')
    expect(firstInvalidField({})).toBeNull()
  })
})

describe('onboardRef', () => {
  it('derives a short, stable reference from the invite id', () => {
    expect(onboardRef('3f9a21c4-1b2c-4d5e-8f90-abcdef123456')).toBe('VN-3F9A21C4')
    expect(onboardRef('3f9a21c4-1b2c-4d5e-8f90-abcdef123456')).toBe(onboardRef('3f9a21c4-1b2c-4d5e-8f90-abcdef123456'))
  })
})
