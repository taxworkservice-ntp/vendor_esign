// Tax ID handling: hash-only storage. The full ID is never persisted —
// only its SHA-256 (for gate comparison) and last-4 (for masked display).
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const normalizeTaxId = (id: string) => id.replace(/\D/g, '')

export const taxIdHash = (id: string) => sha256Hex(normalizeTaxId(id))

export const taxIdLast4 = (id: string) => normalizeTaxId(id).slice(-4)

export const maskTaxId = (last4: string) => `x-xxxx-xxxxx-${last4.slice(0, 2)}-${last4.slice(2)}`
