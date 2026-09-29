// Client-side at-rest encryption for the vendor tax ID (AES-256-GCM via Web Crypto).
//
// MOCK-GRADE ONLY: in the client pilot the key lives in localStorage next to the
// data, so this avoids plaintext-at-rest but is NOT protection against a local
// attacker. Production stores the encrypted value server-side
// (vendors.id_number_encrypted) using ID_ENCRYPTION_KEY (KMS/age) and only ever
// returns the plaintext over an authenticated, authorized channel — see
// server/src/crypto.ts. Never log the plaintext or the key.

const KEY_STORAGE = 'taxwork-mock-id-key-v1'
const PREFIX = 'enc:v1:'
let memoryKey: string | null = null

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

// Allocate with an explicit ArrayBuffer so the value satisfies BufferSource.
function bytes(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(n))
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = bytes(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomKeyB64(): string {
  const k = bytes(32)
  crypto.getRandomValues(k)
  return b64(k)
}

// Mock key: persisted in localStorage, or an in-memory key when unavailable
// (tests / SSR). Exported so callers can pass an explicit key in tests.
export function localKey(): string {
  try {
    const existing = localStorage.getItem(KEY_STORAGE)
    if (existing) return existing
    const fresh = randomKeyB64()
    localStorage.setItem(KEY_STORAGE, fresh)
    return fresh
  } catch {
    if (!memoryKey) memoryKey = randomKeyB64()
    return memoryKey
  }
}

export async function encryptId(plain: string, keyB64: string = localKey()): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt'])
  const iv = bytes(12)
  crypto.getRandomValues(iv)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  )
  return `${PREFIX}${b64(iv)}:${b64(ct)}`
}

// Returns null on any failure (wrong key, tampering, bad format) — never throws.
export async function decryptId(payload: string, keyB64: string = localKey()): Promise<string | null> {
  try {
    if (!payload.startsWith(PREFIX)) return null
    const [ivB64, ctB64] = payload.slice(PREFIX.length).split(':')
    if (!ivB64 || !ctB64) return null
    const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt'])
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64))
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

export function isEncryptedId(value: string | undefined): boolean {
  return !!value && value.startsWith(PREFIX)
}
