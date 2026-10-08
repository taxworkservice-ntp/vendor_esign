import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptId, decryptToken, encryptId, encryptToken } from './crypto'

const KEY = randomBytes(32).toString('base64')

afterEach(() => {
  process.env.ID_ENCRYPTION_KEY = KEY
})

describe('server crypto (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', () => {
    process.env.ID_ENCRYPTION_KEY = KEY
    const enc = encryptId('1234567890123')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(enc).not.toContain('1234567890123')
    expect(decryptId(enc)).toBe('1234567890123')
  })

  it('returns null for a wrong key, tampering, or bad format', () => {
    process.env.ID_ENCRYPTION_KEY = KEY
    const enc = encryptId('1234567890123')
    process.env.ID_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    expect(decryptId(enc)).toBeNull()
    process.env.ID_ENCRYPTION_KEY = KEY
    expect(decryptId(enc.slice(0, -4) + 'AAAA')).toBeNull()
    expect(decryptId('not-encrypted')).toBeNull()
  })

  it('throws on a missing or wrong-length key', () => {
    delete process.env.ID_ENCRYPTION_KEY
    expect(() => encryptId('x')).toThrow(/ID_ENCRYPTION_KEY/)
    process.env.ID_ENCRYPTION_KEY = Buffer.from('short').toString('base64')
    expect(() => encryptId('x')).toThrow(/32 bytes/)
  })

  it('encrypts invite tokens at rest but round-trips them', () => {
    process.env.ID_ENCRYPTION_KEY = KEY
    const token = 'abc123DEF456ghi789'
    const enc = encryptToken(token)
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(enc).not.toContain(token)
    expect(decryptToken(enc)).toBe(token)
  })

  it('passes legacy plaintext tokens through unchanged', () => {
    process.env.ID_ENCRYPTION_KEY = KEY
    expect(decryptToken('legacy-plaintext-token')).toBe('legacy-plaintext-token')
  })

  it('falls back to plaintext when the key is absent (dev)', () => {
    delete process.env.ID_ENCRYPTION_KEY
    expect(encryptToken('tok_dev')).toBe('tok_dev')
  })
})
