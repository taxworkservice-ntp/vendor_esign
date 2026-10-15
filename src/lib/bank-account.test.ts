import { describe, expect, it } from 'vitest'
import {
  BANK_ACCOUNT_ERROR,
  BANK_INCOMPLETE_ERROR,
  bankValidation,
  isValidBankAccount,
  normalizeBankAccount,
} from './bank-account'

describe('bank account validation', () => {
  it('normalises formatting to digits', () => {
    expect(normalizeBankAccount('123-4-56789-0')).toBe('1234567890')
    expect(normalizeBankAccount('  123 456 7890 ')).toBe('1234567890')
  })

  it('accepts ≥ 8 digits, rejects short', () => {
    expect(isValidBankAccount('12345678')).toBe(true)
    expect(isValidBankAccount('123-4-56789-0')).toBe(true)
    expect(isValidBankAccount('1234567')).toBe(false)
    expect(isValidBankAccount('')).toBe(false)
  })

  it('treats a fully empty set as valid (no bank info)', () => {
    expect(bankValidation({})).toBeNull()
    expect(bankValidation({ bankName: '', bankAccount: '', accountHolder: '' })).toBeNull()
    expect(bankValidation({ bankName: '  ', bankAccount: ' ', accountHolder: '' })).toBeNull()
  })

  it('rejects a half-filled set', () => {
    expect(bankValidation({ bankName: 'ธนาคารกสิกรไทย' })).toBe(BANK_INCOMPLETE_ERROR)
    expect(bankValidation({ bankName: 'ธนาคารกสิกรไทย', bankAccount: '1234567890' })).toBe(BANK_INCOMPLETE_ERROR)
    expect(bankValidation({ bankAccount: '1234567890', accountHolder: 'สมชาย' })).toBe(BANK_INCOMPLETE_ERROR)
  })

  it('rejects a complete set with a bad account', () => {
    expect(bankValidation({ bankName: 'ธนาคารกสิกรไทย', bankAccount: '123', accountHolder: 'สมชาย' })).toBe(BANK_ACCOUNT_ERROR)
  })

  it('accepts a complete, valid set', () => {
    expect(bankValidation({ bankName: 'ธนาคารกสิกรไทย', bankAccount: '123-4-56789-0', accountHolder: 'สมชาย ใจดี' })).toBeNull()
  })
})
