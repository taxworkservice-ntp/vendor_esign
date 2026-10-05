import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Stateless, HMAC-signed "view as client" grant. The operator console mints a
// short-lived cookie scoped to one workspace and mode ('read' default, 'write'
// on explicit opt-in). The client API's guard() honours it so support can see
// exactly what the client sees — and, in read mode, nothing can be written.
//
// Key is derived from an existing server secret so no new env var is required.

export const IMPERSONATION_COOKIE = 'tw_imp'
const TTL_MS = 30 * 60 * 1000

export type ImpersonationMode = 'read' | 'write'
export interface Impersonation {
  tenantId: string
  mode: ImpersonationMode
  actor: string
  exp: number
}

function secret(): Buffer {
  const base = process.env.ID_ENCRYPTION_KEY ?? process.env.CRON_SECRET ?? 'dev-impersonation-key'
  return createHash('sha256').update(`tw-imp:${base}`).digest()
}

const b64 = (b: Buffer) => b.toString('base64url')

export function signImpersonation(input: { tenantId: string; mode: ImpersonationMode; actor: string }): string {
  const payload: Impersonation = { ...input, exp: Date.now() + TTL_MS }
  const body = b64(Buffer.from(JSON.stringify(payload)))
  const sig = b64(createHmac('sha256', secret()).update(body).digest())
  return `${body}.${sig}`
}

export function verifyImpersonation(token: string | null | undefined): Impersonation | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = b64(createHmac('sha256', secret()).update(body).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Impersonation
    if (!p.tenantId || (p.mode !== 'read' && p.mode !== 'write')) return null
    if (typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return p
  } catch {
    return null
  }
}

/** Parse the tw_imp cookie out of a Cookie header. */
export function impersonationFromCookie(header: string | undefined): Impersonation | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === IMPERSONATION_COOKIE) return verifyImpersonation(decodeURIComponent(rest.join('=')))
  }
  return null
}

export function impersonationCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${IMPERSONATION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`
}

export function clearImpersonationCookie(): string {
  return `${IMPERSONATION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
}
