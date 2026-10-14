import { describe, expect, it } from 'vitest'
import { EMAIL_REQUIRED_ERROR, PHONE_REQUIRED_ERROR, isValidEmail, isValidPhone, normalizePhone } from './vendor-contact'

// Required at signing: the receipt prints them and the payer needs a real
// channel to the payee. Same rule on the form and the endpoint (shared).

describe('vendor contact validation', () => {
  it('accepts Thai mobiles and landlines, 9–10 digits starting with 0', () => {
    expect(isValidPhone('0812345678')).toBe(true)
    expect(isValidPhone('091-234-5678')).toBe(true)
    expect(isValidPhone('06 1234 5678')).toBe(true)
    expect(isValidPhone('021234567')).toBe(true)
    expect(isValidPhone('038123456')).toBe(true)
  })

  it('rejects short, long, foreign and non-numeric phones', () => {
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('08123456')).toBe(false)
    expect(isValidPhone('08123456789')).toBe(false)
    expect(isValidPhone('+66812345678')).toBe(false)
    expect(isValidPhone('123456789')).toBe(false)
    expect(isValidPhone('abcdefghij')).toBe(false)
  })

  it('normalizes formatting before validating', () => {
    expect(normalizePhone('08-1234 5678')).toBe('0812345678')
    expect(normalizePhone('(02) 123-4567')).toBe('021234567')
  })

  it('accepts real emails and rejects malformed ones', () => {
    expect(isValidEmail('name@example.com')).toBe(true)
    expect(isValidEmail('som.chai@company.co.th')).toBe(true)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
    expect(isValidEmail(`x@${'y'.repeat(200)}.com`)).toBe(false)
  })

  it('carries Thai messages for the form', () => {
    expect(PHONE_REQUIRED_ERROR).toMatch(/9–10 หลัก/)
    expect(EMAIL_REQUIRED_ERROR).toMatch(/อีเมล/)
  })
})
