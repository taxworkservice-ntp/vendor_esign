import { Hono } from 'hono'
import { sql } from '../../src/server/db'
import { sha256hex } from './auth'
import {
  ADMIN_COOKIE,
  clearSessionCookie,
  createSession,
  hashPassword,
  isSuperAdmin,
  roleForTenant,
  sessionCookie,
  sessionUser,
  tempPassword,
  verifyPassword,
  type SessionUser,
} from './auth'
import { PILOT_BE_YEAR, PILOT_TENANT, audit, one, rateLimited, withAuditTenant } from './shared'
import { corsMw } from './cors'

// ── Isolated Admin operation ─────────────────────────────────────────────
// Separate Hono app, separate session cookie (tw_admin, 12h), separate port
// (ADMIN_PORT, default 8788) so admin traffic never shares the public
// client/vendor operation. Mount behind IP allowlist / VPN in prod:
//   ADMIN_IP_ALLOWLIST=1.2.3.4,5.6.7.8  (exact match on x-forwarded-for or direct IP)
// Secrets only via env. Never log passwords, tokens, or personal data.

function adminIpAllowed(ip: string): boolean {
  const list = (process.env.ADMIN_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!list.length) return true
  return list.includes(ip)
}

async function requireAdminSession(c: { req: { header: (n: string) => string | undefined } }): Promise<SessionUser | null> {
  return sessionUser(c.req.header('cookie'), ADMIN_COOKIE)
}

async function adminTenantScope(
  c: { req: { header: (n: string) => string | undefined } },
  tenantId?: string,
) {
  const u = await requireAdminSession(c)
  if (!u) return { error: 'unauthorized' as const, status: 401 as const }
  if (u.mustChangePw) return { error: 'must-change-password' as const, status: 403 as const }
  if (isSuperAdmin(u)) return { u, role: 'super_admin' }
  if (!tenantId) return { error: 'forbidden' as const, status: 403 as const }
  const role = roleForTenant(u, tenantId)
  if (role !== 'client_admin' && role !== 'bookkeeper') return { error: 'forbidden' as const, status: 403 as const }
  return { u, role }
}

export const adminApp = new Hono()

adminApp.use('*', corsMw())

adminApp.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (!adminIpAllowed(ip)) return c.json({ error: 'forbidden' }, 403)
  await next()
})

adminApp.get('/api/health', (c) => c.json({ ok: true, operation: 'admin' }))

adminApp.post('/api/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (rateLimited(`admin-login:${ip}`, 5)) return c.json({ error: 'too-many-requests' }, 429)
  const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email || !body?.password) return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const rows = (await db`select id, email, password_hash, must_change_pw, status, temp_expires_at
    from app_users where lower(email) = ${email}`) as unknown as
    { id: string; email: string; password_hash: string; must_change_pw: boolean; status: string; temp_expires_at: string | null }[]
  const u = one<{ id: string; email: string; password_hash: string; must_change_pw: boolean; status: string; temp_expires_at: string | null }>(rows)
  if (!u || u.status !== 'active') return c.json({ error: 'invalid-credentials' }, 401)
  if (u.temp_expires_at && new Date(String(u.temp_expires_at)) < new Date() && u.must_change_pw)
    return c.json({ error: 'temp-expired' }, 403)
  if (!(await verifyPassword(body.password, String(u.password_hash))))
    return c.json({ error: 'invalid-credentials' }, 401)
  const mems = (await db`select tenant_id, role from user_tenants where user_id = ${String(u.id)}`) as unknown as
    { tenant_id: string; role: string }[]
  const { token, expiresAt } = await createSession(String(u.id), ip, c.req.header('user-agent') ?? '', { admin: true })
  const firstTenant = mems[0] ? String(mems[0].tenant_id) : PILOT_TENANT
  await withAuditTenant(firstTenant, 'client', String(u.id), async () =>
    audit(firstTenant, 'app_users', String(u.id), 'admin.login', 'user', {}, ip))
  return new Response(
    JSON.stringify({
      ok: true,
      mustChangePw: Boolean(u.must_change_pw),
      memberships: mems.map((m) => ({ tenantId: String(m.tenant_id), role: String(m.role) })),
    }),
    { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token, expiresAt, ADMIN_COOKIE) } },
  )
})

adminApp.post('/api/logout', async (c) => {
  const raw = c.req.header('cookie') ?? ''
  const token = raw.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`))?.[1]
  if (token) {
    const db = sql()
    await db`delete from sessions where token_hash = ${sha256hex(decodeURIComponent(token))}`
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(ADMIN_COOKIE) },
  })
})

adminApp.get('/api/me', async (c) => {
  const u = await requireAdminSession(c)
  if (!u) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ userId: u.userId, email: u.email, mustChangePw: u.mustChangePw, memberships: u.memberships })
})

adminApp.post('/api/change-password', async (c) => {
  const u = await requireAdminSession(c)
  if (!u) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as { oldPassword?: string; newPassword?: string } | null
  if (!body?.oldPassword || !body?.newPassword || body.newPassword.length < 10)
    return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const rows = (await db`select password_hash from app_users where id = ${u.userId}`) as unknown as
    { password_hash: string }[]
  if (!(await verifyPassword(body.oldPassword, String(rows[0]?.password_hash ?? ''))))
    return c.json({ error: 'invalid-credentials' }, 401)
  await db`update app_users set password_hash = ${await hashPassword(body.newPassword)},
    must_change_pw = false, temp_expires_at = null, updated_at = now() where id = ${u.userId}`
  return c.json({ ok: true })
})

adminApp.get('/api/admin/tenants', async (c) => {
  const u = await requireAdminSession(c)
  if (!u || (!isSuperAdmin(u) && !u.memberships.some((m) => m.role === 'bookkeeper')))
    return c.json({ error: 'forbidden' }, 403)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const db = sql()
  const rows = (await db`select t.id, t.client_code, t.display_name, t.name, t.status, t.be_year,
      (select count(*) from payment_transactions p where p.tenant_id = t.id) as txns,
      (select count(*) from receipts r where r.tenant_id = t.id) as receipts,
      (select count(*) from user_tenants ut where ut.tenant_id = t.id) as users
    from tenants t order by t.id`) as unknown as Record<string, unknown>[]
  const data = rows
    .map((r) => ({
      id: String(r.id), clientCode: String(r.client_code ?? r.id),
      displayName: String(r.display_name ?? r.name), status: String(r.status ?? 'active'),
      beYear: Number(r.be_year ?? PILOT_BE_YEAR),
      txns: Number(r.txns ?? 0), receipts: Number(r.receipts ?? 0), users: Number(r.users ?? 0),
    }))
    .filter((t) => !q || t.id.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q))
  return c.json({ tenants: data })
})

adminApp.post('/api/admin/tenants', async (c) => {
  const u = await requireAdminSession(c)
  if (!u || !isSuperAdmin(u)) return c.json({ error: 'forbidden' }, 403)
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as {
    id?: string; clientCode?: string; displayName?: string; address?: string;
    taxId?: string; contactName?: string; beYear?: number; startNumber?: number;
  } | null
  const id = (body?.id ?? body?.clientCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!id || id.length < 2 || id.length > 12) return c.json({ error: 'invalid-body' }, 400)
  const code = (body?.clientCode ?? id).trim().toUpperCase()
  const display = (body?.displayName ?? id).trim()
  const beYear = Number(body?.beYear ?? PILOT_BE_YEAR)
  const start = Math.max(1, Number(body?.startNumber ?? 1))
  const db = sql()
  await db`insert into tenants (id, name, client_code, display_name, address, tax_id, contact_name, status, be_year, start_number)
    values (${id}, ${display}, ${code}, ${display}, ${body?.address ?? ''}, ${(body?.taxId ?? '').replace(/\D/g, '').slice(0, 13)},
      ${body?.contactName ?? ''}, 'active', ${beYear}, ${start})
    on conflict (id) do nothing`
  await db`insert into config (tenant_id, key, value) values
    (${id}, 'wht_rates', '[{"paymentType":"ค่าบริการ","rate":3},{"paymentType":"ค่าเช่า","rate":5},{"paymentType":"ค่าขนส่ง","rate":1},{"paymentType":"ทั่วไป","rate":0}]'),
    (${id}, 'stamp_duty_warning_threshold', '20000'),
    (${id}, 'link_expiry_days', '7'),
    (${id}, 'consent_text_v1', '{"th": "ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าเฉพาะธุรกรรมนี้เท่านั้น"}')
    on conflict (tenant_id, key) do nothing`
  await db`insert into receipt_counters (tenant_id, be_year, last_number) values (${id}, ${beYear}, ${start - 1})
    on conflict (tenant_id, be_year) do nothing`
  await withAuditTenant(id, 'super_admin', u.userId, async () =>
    audit(id, 'tenants', id, 'tenant.created', u.email, { clientCode: code }, ip))
  return c.json({ ok: true, id })
})

adminApp.get('/api/admin/tenants/:id', async (c) => {
  const id = c.req.param('id')
  const scope = await adminTenantScope(c, id)
  if ('error' in scope) return c.json({ error: scope.error }, scope.status as 401 | 403)
  const db = sql()
  const rows = (await db`select id, client_code, display_name, name, address, tax_id, contact_name, status, be_year, start_number
    from tenants where id = ${id}`) as unknown as Record<string, unknown>[]
  const t = one<Record<string, unknown>>(rows)
  if (!t) return c.json({ error: 'not-found' }, 404)
  return c.json({
    id: String(t.id), clientCode: String(t.client_code ?? t.id),
    displayName: String(t.display_name ?? t.name), address: String(t.address ?? ''),
    taxId: String(t.tax_id ?? ''), contactName: String(t.contact_name ?? ''),
    status: String(t.status ?? 'active'), beYear: Number(t.be_year ?? PILOT_BE_YEAR),
    startNumber: Number(t.start_number ?? 1),
  })
})

adminApp.patch('/api/admin/tenants/:id', async (c) => {
  const id = c.req.param('id')
  const scope = await adminTenantScope(c, id)
  if ('error' in scope) return c.json({ error: scope.error }, scope.status as 401 | 403)
  if (scope.role !== 'super_admin') return c.json({ error: 'forbidden' }, 403)
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as {
    displayName?: string; address?: string; contactName?: string; status?: string;
  } | null
  if (body?.status && !['active', 'suspended'].includes(body.status)) return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  await db`update tenants set
    display_name = coalesce(${body?.displayName ?? null}, display_name),
    name = coalesce(${body?.displayName ?? null}, name),
    address = coalesce(${body?.address ?? null}, address),
    contact_name = coalesce(${body?.contactName ?? null}, contact_name),
    status = coalesce(${body?.status ?? null}, status),
    updated_at = now() where id = ${id}`
  await withAuditTenant(id, 'super_admin', scope.u.userId, async () =>
    audit(id, 'tenants', id, 'tenant.updated', scope.u.email, body ?? {}, ip))
  return c.json({ ok: true })
})

adminApp.get('/api/admin/tenants/:id/users', async (c) => {
  const id = c.req.param('id')
  const scope = await adminTenantScope(c, id)
  if ('error' in scope) return c.json({ error: scope.error }, scope.status as 401 | 403)
  const db = sql()
  const rows = (await db`select u.id, u.email, u.must_change_pw, u.status, ut.role
    from user_tenants ut join app_users u on u.id = ut.user_id
    where ut.tenant_id = ${id} order by u.email`) as unknown as
    { id: string; email: string; must_change_pw: boolean; status: string; role: string }[]
  return c.json({
    users: rows.map((r) => ({
      id: String(r.id), email: String(r.email),
      mustChangePw: Boolean(r.must_change_pw), status: String(r.status), role: String(r.role),
    })),
  })
})

adminApp.post('/api/admin/tenants/:id/users', async (c) => {
  const id = c.req.param('id')
  const scope = await adminTenantScope(c, id)
  if ('error' in scope) return c.json({ error: scope.error }, scope.status as 401 | 403)
  if (scope.role !== 'super_admin' && scope.role !== 'client_admin')
    return c.json({ error: 'forbidden' }, 403)
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as { email?: string; role?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  const role = body?.role === 'client_admin' ? 'client_admin' : 'client_user'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'invalid-body' }, 400)
  if (scope.role === 'client_admin' && role !== 'client_user') return c.json({ error: 'forbidden' }, 403)
  const password = tempPassword(12)
  const db = sql()
  const existing = (await db`select id from app_users where lower(email) = ${email}`) as unknown as { id: string }[]
  let userId = existing[0] ? String(existing[0].id) : ''
  if (!userId) {
    const ins = (await db`insert into app_users (email, password_hash, must_change_pw, status, temp_expires_at)
      values (${email}, ${await hashPassword(password)}, true, 'active', ${new Date(Date.now() + 7 * 86400 * 1000).toISOString()})
      returning id`) as unknown as { id: string }[]
    userId = String(ins[0].id)
  } else {
    await db`update app_users set password_hash = ${await hashPassword(password)}, must_change_pw = true,
      status = 'active', temp_expires_at = ${new Date(Date.now() + 7 * 86400 * 1000).toISOString()},
      updated_at = now() where id = ${userId}`
  }
  await db`insert into user_tenants (user_id, tenant_id, role) values (${userId}, ${id}, ${role})
    on conflict (user_id, tenant_id) do update set role = ${role}`
  await withAuditTenant(id, (scope.role === 'super_admin' ? 'super_admin' : 'client_admin'), scope.u.userId, async () =>
    audit(id, 'app_users', userId, 'user.created', scope.u.email, { email, role }, ip))
  return c.json({ ok: true, userId, tempPassword: password })
})

adminApp.post('/api/admin/users/:userId/reset', async (c) => {
  const target = c.req.param('userId')
  const u = await requireAdminSession(c)
  if (!u || u.mustChangePw) return c.json({ error: 'forbidden' }, 403)
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const db = sql()
  const mems = (await db`select tenant_id, role from user_tenants where user_id = ${target}`) as unknown as
    { tenant_id: string; role: string }[]
  if (!mems.length) return c.json({ error: 'not-found' }, 404)
  const tenantId = String(mems[0].tenant_id)
  const allowed = isSuperAdmin(u) || roleForTenant(u, tenantId) === 'client_admin'
  if (!allowed) return c.json({ error: 'forbidden' }, 403)
  const password = tempPassword(12)
  await db`update app_users set password_hash = ${await hashPassword(password)}, must_change_pw = true,
    temp_expires_at = ${new Date(Date.now() + 7 * 86400 * 1000).toISOString()}, updated_at = now() where id = ${target}`
  await withAuditTenant(tenantId, 'client', u.userId, async () =>
    audit(tenantId, 'app_users', target, 'user.reset', u.email, {}, ip))
  return c.json({ ok: true, tempPassword: password })
})

adminApp.post('/api/admin/users/:userId/disable', async (c) => {
  const target = c.req.param('userId')
  const u = await requireAdminSession(c)
  if (!u || u.mustChangePw) return c.json({ error: 'forbidden' }, 403)
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const db = sql()
  const mems = (await db`select tenant_id, role from user_tenants where user_id = ${target}`) as unknown as
    { tenant_id: string; role: string }[]
  if (!mems.length) return c.json({ error: 'not-found' }, 404)
  const tenantId = String(mems[0].tenant_id)
  const allowed = isSuperAdmin(u) || roleForTenant(u, tenantId) === 'client_admin'
  if (!allowed) return c.json({ error: 'forbidden' }, 403)
  await db`update app_users set status = 'disabled', updated_at = now() where id = ${target}`
  await db`delete from sessions where user_id = ${target}`
  await withAuditTenant(tenantId, 'client', u.userId, async () =>
    audit(tenantId, 'app_users', target, 'user.disabled', u.email, {}, ip))
  return c.json({ ok: true })
})
