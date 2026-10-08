import { describe, expect, it } from 'vitest'
import { isValidTaxIdChecksum, maskTaxId, taxIdHash, taxIdLast4 } from './taxid'

describe('tax id hash-only storage', () => {
  it('hashes deterministically to 64 hex chars', async () => {
    const h1 = await taxIdHash('1101700230708')
    const h2 = await taxIdHash('1101700230708')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })
  it('different IDs hash differently; last4 + mask work', async () => {
    expect(await taxIdHash('1101700230708')).not.toBe(await taxIdHash('1101700230709'))
    expect(taxIdLast4('1101700230708')).toBe('0708')
    expect(maskTaxId('0708')).toBe('x-xxxx-xxxxx-07-08')
  })
})

describe('tax id checksum', () => {
  it('accepts a valid 13-digit id', () => {
    // 1101700230708 is a checksum-valid example.
    expect(isValidTaxIdChecksum('1101700230708')).toBe(true)
    expect(isValidTaxIdChecksum('1-1017-00230-70-8')).toBe(true) // separators ignored
  })
  it('rejects a wrong check digit or wrong length', () => {
    expect(isValidTaxIdChecksum('1101700230709')).toBe(false)
    expect(isValidTaxIdChecksum('110170023070')).toBe(false)
    expect(isValidTaxIdChecksum('')).toBe(false)
  })
})
