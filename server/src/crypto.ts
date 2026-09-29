import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Server-side at-rest encryption for vendor tax IDs (AES-256-GCM).
// Used for vendors.id_number_encrypted. The key never enters the repo or logs.
// Generate once: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// and set ID_ENCRYPTION_KEY in .env.local (see docs/DB.md).

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const raw = process.env.ID_ENCRYPTION_KEY ?? ''
  if (!raw) throw new Error('Missing ID_ENCRYPTION_KEY (32-byte base64). See docs/DB.md.')
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('ID_ENCRYPTION_KEY must decode to 32 bytes (base64).')
  return k
}

export function encryptId(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

// Returns null on any failure (wrong key, tampering, bad format) — never throws.
export function decryptId(payload: string): string | null {
  try {
    if (!payload.startsWith(PREFIX)) return null
    const [ivB64, tagB64, ctB64] = payload.slice(PREFIX.length).split(':')
    if (!ivB64 || !tagB64 || !ctB64) return null
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
