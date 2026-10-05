import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import {
  ADMIN_COOKIE,
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  hashPassword,
  sessionCookie,
  sessionUser,
  sha256hex,
  verifyPassword,
  type SessionUser,
} from './auth'
import { PILOT_TENANT, audit, one, rateLimited } from './shared'
import { impersonationFromCookie } from './impersonation'

// Client portal auth (admin-provisioned passwords, no self-signup).
// Mounted at /api/auth on the client/vendor operation. Cookie: tw_session (7d).
//
// Lockout is in-memory (5 fails → 15 min), same caveat as the rate limiter:
// move to Postgres behind multiple replicas. No PII is logged.

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const fails = new Map<string, { n: number; until: number }>()

function lockedUntil(email: string): number {
  const f = fails.get(email)
  if (!f) return 0
  if (Date.now() > f.until) {
    fails.delete(email)
    return 0
  }
  return f.n >= MAX_FAILS ? f.until : 0
}

function noteFailure(email: string) {
  const f = fails.get(email)
  const n = (f?.n ?? 0) + 1
  fails.set(email, { n, until: Date.now() + LOCK_MS })
}

// Constant-work verify when the email is unknown — avoids user enumeration.
let dummy: string | null = null
async function dummyHash(): Promise<string> {
  if (!dummy) dummy = await hashPassword('taxwork-dummy-password')
  return dummy
}

function isClient(u: SessionUser): boolean {
  // Must match the roles the login accepts (below) and src/lib/mock-users.ts
  // CLIENT_ROLES — otherwise a signed-in owner/manager/officer gets 401 on
  // every client API call.
  return u.memberships.some((m) =>
    m.role === 'client_user' || m.role === 'client_admin' ||
    m.role === 'owner' || m.role === 'manager' || m.role === 'officer',
  )
}

export async function requireClient(c: { req: { header: (n: string) => string | undefined } }): Promise<SessionUser | null> {
  const u = await sessionUser(c.req.header('cookie'))
  return u && isClient(u) ? u : null
}

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`client-login:${ip}`, 10)) return c.json({ error: 'too-many-requests' }, 429)
  const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email || !body?.password) return c.json({ error: 'invalid-body' }, 400)
  if (lockedUntil(email)) return c.json({ error: 'locked' }, 429)

  const db = sql()
  const rows = (await db`select u.id, u.email, c.password_hash, c.must_change_pw, u.status, c.temp_expires_at, u.is_platform_admin
    from profiles u join auth_credentials c on c.user_id = u.id
    where lower(u.email) = ${email}`) as unknown as
    { id: string; email: string; password_hash: string; must_change_pw: boolean; status: string; temp_expires_at: string | null; is_platform_admin: boolean }[]
  const u = one<(typeof rows)[number]>(rows)

  // Verify even when the user is missing (constant work), then reject generically.
  const ok = u ? await verifyPassword(body.password, String(u.password_hash)) : await verifyPassword(body.password, await dummyHash())
  if (!u || u.status !== 'active' || !ok) {
    noteFailure(email)
    return c.json({ error: 'invalid-credentials' }, 401)
  }
  if (u.temp_expires_at && new Date(String(u.temp_expires_at)) < new Date() && u.must_change_pw)
    return c.json({ error: 'temp-expired' }, 403)

  // Unified login: the account type decides the session and the landing page.
  // A platform admin (provider/operator) gets the isolated admin cookie and the
  // client portal is none the wiser; a client gets the portal session.
  if (u.is_platform_admin) {
    fails.delete(email)
    const { token, expiresAt } = await createSession(String(u.id), ip, c.req.header('user-agent') ?? '', { admin: true })
    await audit('PLATFORM', 'profiles', String(u.id), 'admin.login', u.email, {}, ip)
    return new Response(
      JSON.stringify({ ok: true, kind: 'admin', mustChangePw: Boolean(u.must_change_pw) }),
      { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token, expiresAt, ADMIN_COOKIE) } },
    )
  }

  const mems = (await db`select workspace_user_id, role from client_members where member_user_id = ${String(u.id)}`) as unknown as
    { workspace_user_id: string; role: string }[]
  const memberships = mems.map((m) => ({ tenantId: String(m.workspace_user_id), role: String(m.role) }))
  if (!memberships.some((m) => m.role === 'client_user' || m.role === 'client_admin' || m.role === 'owner' || m.role === 'manager' || m.role === 'officer'))
    return c.json({ error: 'not-a-client-user' }, 403)

  fails.delete(email)
  const { token, expiresAt } = await createSession(String(u.id), ip, c.req.header('user-agent') ?? '')
  const tenantId = memberships[0]?.tenantId ?? PILOT_TENANT
  await withTenant(tenantId, 'client_user', async () =>
    audit(tenantId, 'profiles', String(u.id), 'user.login', 'user', { channel: 'client' }, ip))
  return new Response(
    JSON.stringify({ ok: true, kind: 'client', email: u.email, mustChangePw: Boolean(u.must_change_pw), memberships }),
    { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token, expiresAt, SESSION_COOKIE) } },
  )
})

authRoutes.post('/logout', async (c) => {
  const raw = c.req.header('cookie') ?? ''
  const token = raw.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]
  if (token) {
    const db = sql()
    await db`delete from sessions where token_hash = ${sha256hex(decodeURIComponent(token))}`
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(SESSION_COOKIE) },
  })
})

authRoutes.get('/me', async (c) => {
  const u = await requireClient(c)
  if (u) return c.json({ email: u.email, mustChangePw: u.mustChangePw, memberships: u.memberships })
  // Operator "viewing as client": present a synthetic session for the target
  // workspace so the portal loads, with the impersonation surfaced to the UI.
  const imp = impersonationFromCookie(c.req.header('cookie'))
  if (imp) {
    return c.json({
      email: 'operator (viewing as client)',
      mustChangePw: false,
      memberships: [{ tenantId: imp.tenantId, role: 'owner' }],
      impersonating: true,
      impersonationMode: imp.mode,
      tenantId: imp.tenantId,
    })
  }
  return c.json({ error: 'unauthorized' }, 401)
})

authRoutes.post('/change-password', async (c) => {
  const u = await requireClient(c)
  if (!u) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as { oldPassword?: string; newPassword?: string } | null
  if (!body?.oldPassword || !body?.newPassword || body.newPassword.length < 8)
    return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const rows = (await db`select password_hash from auth_credentials where user_id = ${u.userId}`) as unknown as { password_hash: string }[]
  if (!(await verifyPassword(body.oldPassword, String(rows[0]?.password_hash ?? ''))))
    return c.json({ error: 'invalid-credentials' }, 401)
  await db`update auth_credentials set password_hash = ${await hashPassword(body.newPassword)},
    must_change_pw = false, temp_expires_at = null, updated_at = now() where user_id = ${u.userId}`
  const tenantId = u.memberships[0]?.tenantId ?? PILOT_TENANT
  await withTenant(tenantId, 'client_user', async () =>
    audit(tenantId, 'profiles', u.userId, 'user.password-changed', 'user', {}, 'local'))
  return c.json({ ok: true })
})
