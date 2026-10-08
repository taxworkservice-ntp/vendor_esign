import { Hono } from 'hono'
import { sql } from '../../src/server/db'
import { sha256hex } from './auth'
import {
  ADMIN_COOKIE,
  clearSessionCookie,
  createSession,
  hashPassword,
  sessionCookie,
  sessionUser,
  tempPassword,
  verifyPassword,
  type SessionUser,
} from './auth'
import { PILOT_BE_YEAR, audit, one, rateLimited } from './shared'
import { corsMw } from './cors'
import { getPlatformSettings, savePlatformSetting } from './platform'
import {
  clearImpersonationCookie,
  impersonationCookie,
  signImpersonation,
  type ImpersonationMode,
} from './impersonation'
import { normalizePermissions } from '../../src/lib/permissions'

// ── Provider / operator console ────────────────────────────────────────────
// Isolated operation: separate Hono app, separate session cookie (tw_admin,
// 12h), reachable at /api/admin-op so admin traffic never shares the public
// client/vendor operation. Only platform admins (profiles.is_platform_admin)
// pass the guards — a provider controls the whole app, not one tenant.
//
//   ADMIN_IP_ALLOWLIST=1.2.3.4,5.6.7.8  (exact match on x-forwarded-for)
//
// Secrets only via env. Never log passwords, tokens, or personal data.

function adminIpAllowed(ip: string): boolean {
  const list = (process.env.ADMIN_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!list.length) return true
  return list.includes(ip)
}

type Ctx = { req: { header: (n: string) => string | undefined; query?: (n: string) => string | undefined } }

async function requireAdminSession(c: Ctx): Promise<SessionUser | null> {
  return sessionUser(c.req.header('cookie'), ADMIN_COOKIE)
}

/** Session is required; must be a platform admin and past first-login change. */
async function adminOnly(c: Ctx): Promise<{ u: SessionUser } | { error: string; status: 401 | 403 }> {
  const u = await requireAdminSession(c)
  if (!u) return { error: 'unauthorized', status: 401 }
  if (!u.isPlatformAdmin) return { error: 'forbidden', status: 403 }
  if (u.mustChangePw) return { error: 'must-change-password', status: 403 }
  return { u }
}

export const adminApp = new Hono()

adminApp.use('*', corsMw())

adminApp.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (!adminIpAllowed(ip)) return c.json({ error: 'forbidden' }, 403)
  await next()
})

adminApp.get('/api/health', (c) => c.json({ ok: true, operation: 'admin' }))

async function writeAudit(tenantId: string, entityType: string, entityId: string, eventType: string, actor: string | null, metadata: unknown, ip: string) {
  await audit(tenantId, entityType, entityId, eventType, actor, metadata, ip)
}

adminApp.post('/api/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (await rateLimited(`admin-login:${ip}`, 5)) return c.json({ error: 'too-many-requests' }, 429)
  const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email || !body?.password) return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const rows = (await db`select u.id, u.email, c.password_hash, c.must_change_pw, u.status, c.temp_expires_at, u.is_platform_admin
    from profiles u join auth_credentials c on c.user_id = u.id
    where lower(u.email) = ${email}`) as unknown as
    { id: string; email: string; password_hash: string; must_change_pw: boolean; status: string; temp_expires_at: string | null; is_platform_admin: boolean }[]
  const u = one<{ id: string; email: string; password_hash: string; must_change_pw: boolean; status: string; temp_expires_at: string | null; is_platform_admin: boolean }>(rows)
  // Same generic error for unknown, disabled, or non-operator accounts — the
  // console does not reveal which emails exist.
  if (!u || u.status !== 'active' || !u.is_platform_admin) return c.json({ error: 'invalid-credentials' }, 401)
  if (u.temp_expires_at && new Date(String(u.temp_expires_at)) < new Date() && u.must_change_pw)
    return c.json({ error: 'temp-expired' }, 403)
  if (!(await verifyPassword(body.password, String(u.password_hash))))
    return c.json({ error: 'invalid-credentials' }, 401)
  const { token, expiresAt } = await createSession(String(u.id), ip, c.req.header('user-agent') ?? '', { admin: true })
  await writeAudit('PLATFORM', 'profiles', String(u.id), 'admin.login', u.email, {}, ip)
  return new Response(
    JSON.stringify({ ok: true, mustChangePw: Boolean(u.must_change_pw), isPlatformAdmin: true, memberships: [] }),
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
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', clearSessionCookie(ADMIN_COOKIE))
  headers.append('Set-Cookie', clearImpersonationCookie())
  return new Response(JSON.stringify({ ok: true }), { headers })
})

adminApp.get('/api/me', async (c) => {
  const u = await requireAdminSession(c)
  if (!u || !u.isPlatformAdmin) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ userId: u.userId, email: u.email, mustChangePw: u.mustChangePw, isPlatformAdmin: true, memberships: u.memberships })
})

adminApp.post('/api/change-password', async (c) => {
  const u = await requireAdminSession(c)
  if (!u || !u.isPlatformAdmin) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as { oldPassword?: string; newPassword?: string } | null
  if (!body?.oldPassword || !body?.newPassword || body.newPassword.length < 10)
    return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const rows = (await db`select password_hash from auth_credentials where user_id = ${u.userId}`) as unknown as
    { password_hash: string }[]
  if (!(await verifyPassword(body.oldPassword, String(rows[0]?.password_hash ?? ''))))
    return c.json({ error: 'invalid-credentials' }, 401)
  await db`update auth_credentials set password_hash = ${await hashPassword(body.newPassword)},
    must_change_pw = false, temp_expires_at = null, updated_at = now() where user_id = ${u.userId}`
  await writeAudit('PLATFORM', 'profiles', u.userId, 'admin.password.changed', u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

// ── Overview ────────────────────────────────────────────────────────────────
adminApp.get('/api/admin/overview', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const db = sql()
  const t = one<Record<string, unknown>>(await db`select
      count(*)::int as tenants,
      count(*) filter (where status = 'active')::int as active,
      count(*) filter (where status = 'suspended')::int as suspended
    from client_profiles`)
  const u = one<Record<string, unknown>>(await db`select
      count(*)::int as users,
      count(*) filter (where status = 'active')::int as active
    from profiles where is_platform_admin = false`)
  const counts = one<Record<string, unknown>>(await db`select
      (select count(*) from vendor_payables)::int as transactions,
      (select count(*) from vendor_receipts)::int as receipts,
      (select count(*) from wht_records)::int as wht,
      (select count(*) from vendor_authorizations)::int as signings`)
  const recentTenants = (await db`select id, coalesce(display_name, name) as name, client_code, status, created_at
    from client_profiles order by created_at desc limit 5`) as unknown as Record<string, unknown>[]
  const recentAudit = (await db`select id, coalesce(user_id, 'PLATFORM') as tenant_id, entity_type, event_type, actor, created_at
    from audit_events order by created_at desc limit 8`) as unknown as Record<string, unknown>[]
  const platform = await getPlatformSettings()
  return c.json({
    tenants: { total: Number(t?.tenants ?? 0), active: Number(t?.active ?? 0), suspended: Number(t?.suspended ?? 0) },
    users: { total: Number(u?.users ?? 0), active: Number(u?.active ?? 0) },
    counts: {
      transactions: Number(counts?.transactions ?? 0),
      receipts: Number(counts?.receipts ?? 0),
      wht: Number(counts?.wht ?? 0),
      signings: Number(counts?.signings ?? 0),
    },
    platform,
    recentTenants: recentTenants.map((r) => ({
      id: String(r.id), name: String(r.name ?? r.id), clientCode: String(r.client_code ?? r.id),
      status: String(r.status ?? 'active'), createdAt: r.created_at,
    })),
    recentAudit: recentAudit.map((r) => ({
      id: String(r.id), tenantId: String(r.tenant_id), entityType: String(r.entity_type),
      eventType: String(r.event_type), actor: r.actor ? String(r.actor) : null, createdAt: r.created_at,
    })),
  })
})

// ── Tenants (client workspaces) ──────────────────────────────────────────────
adminApp.get('/api/admin/tenants', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const status = c.req.query('status') ?? 'all'
  const db = sql()
  const rows = (await db`select t.id, t.client_code, t.display_name, t.name, t.status, t.be_year, t.created_at,
      (select count(*) from vendor_payables p where p.user_id = t.id) as txns,
      (select count(*) from vendor_receipts r where r.user_id = t.id) as receipts,
      (select count(*) from client_members ut where ut.workspace_user_id = t.id) as users
    from client_profiles t order by t.created_at desc`) as unknown as Record<string, unknown>[]
  const data = rows
    .map((r) => ({
      id: String(r.id), clientCode: String(r.client_code ?? r.id),
      displayName: String(r.display_name ?? r.name), status: String(r.status ?? 'active'),
      beYear: Number(r.be_year ?? PILOT_BE_YEAR),
      txns: Number(r.txns ?? 0), receipts: Number(r.receipts ?? 0), users: Number(r.users ?? 0),
      createdAt: r.created_at,
    }))
    .filter((t) => (status === 'all' || t.status === status))
    .filter((t) => !q || t.id.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q))
  return c.json({ tenants: data })
})

adminApp.post('/api/admin/tenants', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
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
  await db`insert into client_profiles (id, name, client_code, display_name, address, tax_id, contact_name, status, be_year, start_number)
    values (${id}, ${display}, ${code}, ${display}, ${body?.address ?? ''}, ${(body?.taxId ?? '').replace(/\D/g, '').slice(0, 13)},
      ${body?.contactName ?? ''}, 'active', ${beYear}, ${start})
    on conflict (id) do nothing`
  await db`insert into config (user_id, key, value) values
    (${id}, 'wht_rates', '[{"paymentType":"ค่าจ้างทำของ","rate":3,"label":"ค่าจ้างทำของ"},{"paymentType":"ค่าวิชาชีพอิสระ","rate":3,"label":"ค่าวิชาชีพอิสระ"},{"paymentType":"ค่าบริการ","rate":3,"label":"ค่าบริการ"},{"paymentType":"ค่าเช่าทรัพย์สิน","rate":5,"label":"ค่าเช่าทรัพย์สิน"},{"paymentType":"ค่านายหน้า","rate":3,"label":"ค่านายหน้า"},{"paymentType":"ค่าขนส่ง","rate":1,"label":"ค่าขนส่ง"},{"paymentType":"ไม่หักภาษี ณ ที่จ่าย","rate":0,"label":"ไม่หักภาษี ณ ที่จ่าย"}]'),
    (${id}, 'wht_min_threshold', '1000'),
    (${id}, 'link_expiry_days', '7'),
    (${id}, 'consent_text_v1', '{"th": "ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าเฉพาะธุรกรรมนี้เท่านั้น"}')
    on conflict (user_id, key) do nothing`
  await db`insert into doc_number_sequences (user_id, doc_type, be_year, vendor_no, last_number) values (${id}, 'vendor_receipt', ${beYear}, 0, ${start - 1})
    on conflict (user_id, doc_type, be_year, vendor_no) do nothing`
  await writeAudit(id, 'client_profiles', id, 'tenant.created', g.u.email, { clientCode: code }, ip)
  return c.json({ ok: true, id })
})

adminApp.get('/api/admin/tenants/:id', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const id = c.req.param('id')
  const db = sql()
  const rows = (await db`select id, client_code, display_name, name, address, tax_id, contact_name, status, be_year, start_number
    from client_profiles where id = ${id}`) as unknown as Record<string, unknown>[]
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
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as {
    displayName?: string; address?: string; contactName?: string; status?: string;
  } | null
  if (body?.status && !['active', 'suspended'].includes(body.status)) return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  await db`update client_profiles set
    display_name = coalesce(${body?.displayName ?? null}, display_name),
    name = coalesce(${body?.displayName ?? null}, name),
    address = coalesce(${body?.address ?? null}, address),
    contact_name = coalesce(${body?.contactName ?? null}, contact_name),
    status = coalesce(${body?.status ?? null}, status),
    updated_at = now() where id = ${id}`
  await writeAudit(id, 'client_profiles', id, 'tenant.updated', g.u.email, body ?? {}, ip)
  return c.json({ ok: true })
})

// Delete is permitted ONLY when the workspace has no data. Anything with a
// transaction is archived (suspend) instead, so receipts stay immutable.
adminApp.delete('/api/admin/tenants/:id', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const id = c.req.param('id')
  const db = sql()
  const counts = one<Record<string, unknown>>(await db`select
    (select count(*) from vendor_payables where user_id = ${id})::int as txns,
    (select count(*) from vendor_receipts where user_id = ${id})::int as receipts,
    (select count(*) from wht_records where user_id = ${id})::int as wht,
    (select count(*) from vendor_payees where user_id = ${id})::int as vendors,
    (select count(*) from items where user_id = ${id})::int as items`)
  const dirty = ['txns', 'receipts', 'wht', 'vendors', 'items'].some((k) => Number(counts?.[k] ?? 0) > 0)
  if (dirty) return c.json({ error: 'tenant-not-empty', counts }, 409)
  await db`delete from client_members where workspace_user_id = ${id}`
  await db`delete from config where user_id = ${id}`
  await db`delete from doc_number_sequences where user_id = ${id}`
  await db`delete from client_profiles where id = ${id}`
  await writeAudit('PLATFORM', 'client_profiles', id, 'tenant.deleted', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

adminApp.get('/api/admin/tenants/:id/users', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const id = c.req.param('id')
  const db = sql()
  const rows = (await db`select u.id, u.email, u.must_change_pw, u.status, ut.role
    from client_members ut join profiles u on u.id = ut.member_user_id
    where ut.workspace_user_id = ${id} order by u.email`) as unknown as
    { id: string; email: string; must_change_pw: boolean; status: string; role: string }[]
  return c.json({
    users: rows.map((r) => ({
      id: String(r.id), email: String(r.email),
      mustChangePw: Boolean(r.must_change_pw), status: String(r.status), role: String(r.role),
    })),
  })
})

adminApp.post('/api/admin/tenants/:id/users', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as { email?: string; role?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  const role = (['owner', 'manager', 'officer'] as const).includes(body?.role as never) ? (body!.role as string) : 'officer'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'invalid-body' }, 400)
  const password = tempPassword(12)
  const db = sql()
  const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString()
  const existing = (await db`select id from profiles where lower(email) = ${email}`) as unknown as { id: string }[]
  let userId = existing[0] ? String(existing[0].id) : ''
  if (!userId) {
    const ins = (await db`insert into profiles (email, status, role, password_hash) values (${email}, 'active', ${role}, ${await hashPassword(password)})
      returning id`) as unknown as { id: string }[]
    userId = String(ins[0].id)
    await db`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
      values (${userId}, ${await hashPassword(password)}, true, ${expires})`
  } else {
    await db`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
      values (${userId}, ${await hashPassword(password)}, true, ${expires})
      on conflict (user_id) do update set password_hash = excluded.password_hash,
        must_change_pw = true, temp_expires_at = excluded.temp_expires_at, updated_at = now()`
    await db`update profiles set status = 'active', password_hash = ${await hashPassword(password)}, updated_at = now() where id = ${userId}`
  }
  await db`insert into client_members (member_user_id, workspace_user_id, role, status, password_changed, permissions)
    values (${userId}, ${id}, ${role}, 'active', false, '{}'::jsonb)
    on conflict (member_user_id, workspace_user_id) do update set role = ${role}, status = 'active', password_changed = false`
  await db`insert into client_permission_audit (workspace_user_id, actor_user_id, target_member_id, action, after)
    values (${id}, ${g.u.userId}, ${userId}, 'user.created', ${JSON.stringify({ role })}::jsonb)`
  await writeAudit(id, 'profiles', userId, 'user.created', g.u.email, { email, role }, ip)
  return c.json({ ok: true, userId, tempPassword: password })
})

// ── All users (cross-tenant directory) ───────────────────────────────────────
adminApp.get('/api/admin/users', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const db = sql()
  const rows = (await db`select p.id, p.email, p.status, c.must_change_pw, p.created_at,
      coalesce(json_agg(json_build_object('tenantId', cm.workspace_user_id, 'role', cm.role, 'status', cm.status)
        order by cm.workspace_user_id) filter (where cm.member_user_id is not null), '[]') as memberships
    from profiles p
    left join client_members cm on cm.member_user_id = p.id
    left join auth_credentials c on c.user_id = p.id
    where p.is_platform_admin = false
    group by p.id, p.email, p.status, c.must_change_pw, p.created_at
    order by p.created_at desc`) as unknown as Record<string, unknown>[]
  const users = rows
    .map((r) => ({
      id: String(r.id), email: String(r.email), status: String(r.status ?? 'active'),
      mustChangePw: Boolean(r.must_change_pw),
      memberships: (r.memberships as { tenantId: string; role: string; status: string }[]) ?? [],
      createdAt: r.created_at,
    }))
    .filter((u) => !q || u.email.toLowerCase().includes(q) || u.memberships.some((m) => m.tenantId.toLowerCase().includes(q)))
  return c.json({ users })
})

adminApp.patch('/api/admin/users/:userId', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  const body = (await c.req.json().catch(() => null)) as { role?: string; permissions?: unknown; tenantId?: string } | null
  const db = sql()
  const mems = (await db`select workspace_user_id, role, permissions from client_members where member_user_id = ${target}`) as unknown as
    { workspace_user_id: string; role: string; permissions: unknown }[]
  if (!mems.length) return c.json({ error: 'not-found' }, 404)
  const workspaceId = body?.tenantId ? String(body.tenantId) : String(mems[0].workspace_user_id)
  const nextRole = (['owner', 'manager', 'officer'] as const).includes(body?.role as never)
    ? (body!.role as string)
    : (mems.find((m) => m.workspace_user_id === workspaceId)?.role ?? mems[0].role)
  const before = { role: mems[0].role, permissions: mems[0].permissions }
  const nextPermissions = normalizePermissions(body?.permissions)
  await db`update client_members set role = ${nextRole}, permissions = ${JSON.stringify(nextPermissions)}::jsonb
    where member_user_id = ${target} and workspace_user_id = ${workspaceId}`
  await db`insert into client_permission_audit (workspace_user_id, actor_user_id, target_member_id, action, before, after)
    values (${workspaceId}, ${g.u.userId}, ${target}, 'member.updated',
      ${JSON.stringify(before)}::jsonb, ${JSON.stringify({ role: nextRole, permissions: nextPermissions })}::jsonb)`
  await writeAudit(workspaceId, 'client_members', target, 'member.updated', g.u.email, { role: nextRole }, ip)
  return c.json({ ok: true })
})

adminApp.post('/api/admin/users/:userId/reset', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const db = sql()
  const mems = (await db`select workspace_user_id, role from client_members where member_user_id = ${target}`) as unknown as
    { workspace_user_id: string; role: string }[]
  const tenantId = mems[0] ? String(mems[0].workspace_user_id) : 'PLATFORM'
  const password = tempPassword(12)
  await db`update auth_credentials set password_hash = ${await hashPassword(password)}, must_change_pw = true,
    temp_expires_at = ${new Date(Date.now() + 7 * 86400 * 1000).toISOString()}, updated_at = now() where user_id = ${target}`
  await db`delete from sessions where user_id = ${target}`
  await writeAudit(tenantId, 'profiles', target, 'user.reset', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true, tempPassword: password })
})

adminApp.post('/api/admin/users/:userId/disable', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const db = sql()
  const mems = (await db`select workspace_user_id from client_members where member_user_id = ${target}`) as unknown as
    { workspace_user_id: string }[]
  const tenantId = mems[0] ? String(mems[0].workspace_user_id) : 'PLATFORM'
  await db`update profiles set status = 'disabled', updated_at = now() where id = ${target} and is_platform_admin = false`
  await db`delete from sessions where user_id = ${target}`
  await writeAudit(tenantId, 'profiles', target, 'user.disabled', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

adminApp.post('/api/admin/users/:userId/enable', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const db = sql()
  await db`update profiles set status = 'active', updated_at = now() where id = ${target}`
  await writeAudit('PLATFORM', 'profiles', target, 'user.enabled', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

adminApp.post('/api/admin/users/:userId/force-change', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const db = sql()
  await db`update auth_credentials set must_change_pw = true, updated_at = now() where user_id = ${target}`
  await writeAudit('PLATFORM', 'profiles', target, 'user.force_change', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

adminApp.post('/api/admin/users/:userId/revoke-sessions', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const target = c.req.param('userId')
  const db = sql()
  await db`delete from sessions where user_id = ${target}`
  await writeAudit('PLATFORM', 'profiles', target, 'user.sessions.revoked', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

// ── Audit log ────────────────────────────────────────────────────────────────
adminApp.get('/api/admin/audit', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const tenant = (c.req.query('tenant') ?? '').trim()
  const event = (c.req.query('event') ?? '').trim()
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)))
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0))
  // ORDER BY cannot be a bound parameter, so it comes from a fixed whitelist —
  // never from request text. `id` is a stable tiebreaker so paging is correct.
  const AUDIT_ORDER: Record<string, string> = {
    time: 'created_at',
    tenant: 'user_id',
    event: 'event_type',
    entity: 'entity_id',
    actor: 'actor',
    ip: 'ip',
  }
  const sortCol = AUDIT_ORDER[(c.req.query('sort') ?? '').trim()] ?? 'created_at'
  const dir = c.req.query('order') === 'asc' ? 'asc' : 'desc'
  const db = sql()
  const params: unknown[] = []
  const conds: string[] = []
  if (tenant !== '') { params.push(tenant); conds.push(`user_id = $${params.length}`) }
  if (event !== '') { params.push(event); conds.push(`event_type = $${params.length}`) }
  if (q !== '') {
    params.push('%' + q + '%')
    conds.push(`(lower(event_type) like $${params.length} or lower(coalesce(actor,'')) like $${params.length})`)
  }
  const where = conds.length ? `where ${conds.join(' and ')}` : ''
  params.push(limit)
  const limP = `$${params.length}`
  params.push(offset)
  const offP = `$${params.length}`
  const rows = (await db.query(
    `select id, user_id, entity_type, entity_id, event_type, actor, metadata, ip, created_at
     from audit_events ${where}
     order by ${sortCol} ${dir}, id asc limit ${limP} offset ${offP}`,
    params as never[],
  )) as unknown as Record<string, unknown>[]
  const total = one<{ n: number }>(await db`select count(*)::int as n from audit_events
    where (${tenant === ''} or user_id = ${tenant}) and (${event === ''} or event_type = ${event})
      and (${q === ''} or lower(event_type) like ${'%' + q + '%'} or lower(coalesce(actor,'')) like ${'%' + q + '%'})`)
  return c.json({
    events: rows.map((r) => ({
      id: String(r.id), tenantId: String(r.user_id), entityType: String(r.entity_type), entityId: String(r.entity_id),
      eventType: String(r.event_type), actor: r.actor ? String(r.actor) : null,
      metadata: r.metadata ?? {}, ip: r.ip ? String(r.ip) : null, createdAt: r.created_at,
    })),
    total: Number(total?.n ?? 0),
  })
})

// ── Platform settings (announcement, maintenance, flags) ─────────────────────
adminApp.get('/api/admin/settings', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  return c.json(await getPlatformSettings())
})

adminApp.put('/api/admin/settings', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const body = (await c.req.json().catch(() => null)) as {
    announcement?: unknown; maintenance?: unknown; flags?: unknown
  } | null
  if (!body) return c.json({ error: 'invalid-body' }, 400)
  if (body.announcement !== undefined) {
    const a = body.announcement as { active?: unknown; level?: unknown; message?: unknown }
    if (!['info', 'warning', 'critical'].includes(String(a?.level))) return c.json({ error: 'invalid-body' }, 400)
    await savePlatformSetting('announcement', {
      active: Boolean(a?.active), level: String(a?.level), message: String(a?.message ?? '').slice(0, 500),
    }, g.u.email)
  }
  if (body.maintenance !== undefined) {
    const m = body.maintenance as { mode?: unknown; message?: unknown }
    if (!['off', 'read_only', 'full'].includes(String(m?.mode))) return c.json({ error: 'invalid-body' }, 400)
    await savePlatformSetting('maintenance', { mode: String(m?.mode), message: String(m?.message ?? '').slice(0, 500) }, g.u.email)
  }
  if (body.flags !== undefined && body.flags && typeof body.flags === 'object') {
    await savePlatformSetting('flags', body.flags, g.u.email)
  }
  await writeAudit('PLATFORM', 'platform_settings', 'settings', 'platform.settings.updated', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json(await getPlatformSettings())
})

// ── Operator sessions ────────────────────────────────────────────────────────
adminApp.get('/api/admin/sessions', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const db = sql()
  const rows = (await db`select id, created_at, expires_at, ip, user_agent from sessions
    where user_id = ${g.u.userId} and expires_at > now() order by created_at desc`) as unknown as Record<string, unknown>[]
  return c.json({
    sessions: rows.map((r) => ({
      id: String(r.id), createdAt: r.created_at, expiresAt: r.expires_at,
      ip: r.ip ? String(r.ip) : null, userAgent: r.user_agent ? String(r.user_agent) : null,
    })),
  })
})

adminApp.post('/api/admin/sessions/:id/revoke', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const db = sql()
  await db`delete from sessions where id = ${c.req.param('id')} and user_id = ${g.u.userId}`
  await writeAudit('PLATFORM', 'sessions', c.req.param('id'), 'admin.session.revoked', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return c.json({ ok: true })
})

// ── Impersonation ("view as client") ─────────────────────────────────────────
adminApp.post('/api/admin/impersonate', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  const body = (await c.req.json().catch(() => null)) as { tenantId?: string; mode?: string } | null
  const tenantId = (body?.tenantId ?? '').trim()
  const mode: ImpersonationMode = body?.mode === 'write' ? 'write' : 'read'
  if (!tenantId) return c.json({ error: 'invalid-body' }, 400)
  const db = sql()
  const tenant = one<{ id: string }>(await db`select id from client_profiles where id = ${tenantId} and status = 'active'`)
  if (!tenant) return c.json({ error: 'not-found' }, 404)
  const token = signImpersonation({ tenantId, mode, actor: g.u.email })
  await writeAudit(tenantId, 'client_profiles', tenantId, 'impersonation.start', g.u.email, { mode }, c.req.header('x-forwarded-for') ?? 'local')
  return new Response(JSON.stringify({ ok: true, tenantId, mode }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': impersonationCookie(token) },
  })
})

adminApp.post('/api/admin/impersonate/stop', async (c) => {
  const g = await adminOnly(c)
  if ('error' in g) return c.json({ error: g.error }, g.status)
  await writeAudit('PLATFORM', 'client_profiles', 'impersonation', 'impersonation.stop', g.u.email, {}, c.req.header('x-forwarded-for') ?? 'local')
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearImpersonationCookie() },
  })
})
