import { describe, expect, it } from 'vitest'
import { amountToThaiWords, integerToThaiWords, validateThaiId } from './thai-words'

describe('thai amount in words', () => {
  it('spec example: 2910 → สองพันเก้าร้อยสิบบาทถ้วน', () => {
    expect(amountToThaiWords(2910)).toBe('สองพันเก้าร้อยสิบบาทถ้วน')
  })
  it('zero', () => {
    expect(amountToThaiWords(0)).toBe('ศูนย์บาทถ้วน')
  })
  it('satang', () => {
    expect(amountToThaiWords(10.5)).toBe('สิบบาทห้าสิบสตางค์')
    expect(amountToThaiWords(0.25)).toBe('ยี่สิบห้าสตางค์')
  })
  it('เอ็ด / ยี่ rules', () => {
    expect(integerToThaiWords(11)).toBe('สิบเอ็ด')
    expect(integerToThaiWords(21)).toBe('ยี่สิบเอ็ด')
    expect(integerToThaiWords(20)).toBe('ยี่สิบ')
    expect(integerToThaiWords(101)).toBe('หนึ่งร้อยหนึ่ง')
    expect(integerToThaiWords(12)).toBe('สิบสอง')
  })
  it('millions', () => {
    expect(integerToThaiWords(1000000)).toBe('หนึ่งล้าน')
    expect(integerToThaiWords(2500000)).toBe('สองล้านห้าแสน')
    expect(integerToThaiWords(10000000)).toBe('สิบล้าน')
  })
})

describe('thai id checksum', () => {
  it('accepts valid ids, rejects bad checksum / short input', () => {
    // '1234567890121' hand-verified: weights 13..2 → sum 352, 352%11=0 → check 1
    expect(validateThaiId('1234567890121')).toBe(true)
    expect(validateThaiId('1101700230708')).toBe(true)
    expect(validateThaiId('1234567890122')).toBe(false)
    expect(validateThaiId('1101700230701')).toBe(false)
    expect(validateThaiId('123')).toBe(false)
    expect(validateThaiId('')).toBe(false)
  })
})
