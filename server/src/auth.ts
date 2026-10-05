import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { sql } from '../../src/server/db'

const scryptAsync = promisify(scryptCb) as unknown as (
  pw: string | Buffer,
  s: Buffer,
  keylen: number,
  opts: Record<string, number>,
) => Promise<Buffer>

// Professional-grade password hashing without native deps (free-tier portable).
// Format: scrypt$N$r$p$saltHex$keyHex — never log or return the hash.
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 32 * 1024 * 1024 })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [kind, n, r, p, saltHex, keyHex] = stored.split('$')
    if (kind !== 'scrypt' || !saltHex || !keyHex) return false
    const key = await scryptAsync(
      password,
      Buffer.from(saltHex, 'hex'),
      Buffer.from(keyHex, 'hex').length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024 },
    )
    const expected = Buffer.from(keyHex, 'hex')
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

export function tempPassword(len = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(len)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function sessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256hex(token) }
}

function getCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export interface SessionUser {
  userId: string
  email: string
  mustChangePw: boolean
  status: string
  /** Provider/operator account (controls the whole app, member of no client). */
  isPlatformAdmin: boolean
  memberships: { tenantId: string; role: string }[]
}

export const SESSION_COOKIE = 'tw_session'
export const ADMIN_COOKIE = 'tw_admin'

const SESSION_DAYS = 7
const ADMIN_SESSION_HOURS = 12

export async function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  opts?: { admin?: boolean },
): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = sessionToken()
  const expiresAt = opts?.admin
    ? new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000)
    : new Date(Date.now() + SESSION_DAYS * 86400 * 1000)
  const db = sql()
  await db`insert into sessions (user_id, token_hash, expires_at, ip, user_agent)
    values (${userId}, ${hash}, ${expiresAt.toISOString()}, ${ip}, ${userAgent.slice(0, 500)})`
  return { token, expiresAt }
}

export async function sessionUser(
  cookieHeader: string | undefined,
  cookieName: string = SESSION_COOKIE,
): Promise<SessionUser | null> {
  const token = getCookie(cookieHeader, cookieName)
  if (!token) return null
  const db = sql()
  const rows = (await db`
    select u.id, u.email, c.must_change_pw, u.status, u.is_platform_admin
    from sessions s
    join profiles u on u.id = s.user_id
    join auth_credentials c on c.user_id = u.id
    where s.token_hash = ${sha256hex(token)} and s.expires_at > now() and u.status = 'active'`) as unknown as
    { id: string; email: string; must_change_pw: boolean; status: string; is_platform_admin: boolean }[]
  const u = rows[0]
  if (!u) return null
  const mems = (await db`select workspace_user_id, role from client_members where member_user_id = ${u.id}`) as unknown as
    { workspace_user_id: string; role: string }[]
  return {
    userId: String(u.id),
    email: String(u.email),
    mustChangePw: Boolean(u.must_change_pw),
    status: String(u.status),
    isPlatformAdmin: Boolean(u.is_platform_admin),
    memberships: mems.map((m) => ({ tenantId: String(m.workspace_user_id), role: String(m.role) })),
  }
}

export function sessionCookie(token: string, expiresAt: Date, name: string = SESSION_COOKIE): string {
  return `${name}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
    (expiresAt.getTime() - Date.now()) / 1000,
  )}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export function clearSessionCookie(name: string = SESSION_COOKIE): string {
  return `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
}

export function isSuperAdmin(u: SessionUser | null): boolean {
  return !!u?.memberships.some((m) => m.role === 'super_admin')
}

export function roleForTenant(u: SessionUser, tenantId: string): string | null {
  if (u.memberships.some((m) => m.role === 'super_admin')) return 'super_admin'
  if (u.memberships.some((m) => m.role === 'bookkeeper')) return 'bookkeeper'
  return u.memberships.find((m) => m.tenantId === tenantId)?.role ?? null
}
