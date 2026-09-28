import { describe, expect, it } from 'vitest'
import { maskTaxId, taxIdHash, taxIdLast4 } from './taxid'

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
