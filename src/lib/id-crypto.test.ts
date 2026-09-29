import { describe, expect, it } from 'vitest'
import { decryptId, encryptId, isEncryptedId, randomKeyB64 } from './id-crypto'

describe('id-crypto (mock, AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', async () => {
    const key = randomKeyB64()
    const enc = await encryptId('1234567890123', key)
    expect(isEncryptedId(enc)).toBe(true)
    expect(enc).not.toContain('1234567890123')
    expect(await decryptId(enc, key)).toBe('1234567890123')
  })

  it('returns null for a wrong key, tampering, or bad format', async () => {
    const key = randomKeyB64()
    const enc = await encryptId('1234567890123', key)
    expect(await decryptId(enc, randomKeyB64())).toBeNull()
    expect(await decryptId(enc.slice(0, -4) + 'AAAA', key)).toBeNull()
    expect(await decryptId('not-encrypted', key)).toBeNull()
    expect(await decryptId('', key)).toBeNull()
  })

  it('produces a fresh IV per call', async () => {
    const key = randomKeyB64()
    expect(await encryptId('same', key)).not.toBe(await encryptId('same', key))
  })
})
