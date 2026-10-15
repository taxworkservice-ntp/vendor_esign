import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { normalizePermissions, type Permissions } from '../../src/lib/permissions'
import { audit, one } from './shared'

// ── Team permission management (owner self-service) ─────────────────────────
// Split of duties: the operator console owns identity (create users, assign
// roles, disable, reset passwords). The workspace owner owns *permission
// flags* for manager/officer members — and nothing else. There is deliberately
// no invite, role-change, or disable endpoint here, so roles can never be
// hijacked from below: the client has no role-writing route whatsoever.
//
// Mounted under /api/client, so read-mode impersonation writes are already
// blocked by the client-surface middleware; write-mode impersonation is
// treated as the owner (same as PUT /api/settings).

export const teamRoutes = new Hono()

type Guarded = Awaited<ReturnType<typeof guard>>

export interface TeamActor {
  userId: string
  role: string
}
export interface TeamTarget {
  userId: string
  role: string
}

export type TeamEditCheck =
  | { ok: true; permissions: Permissions }
  | { ok: false; error: 'forbidden' | 'not-found' | 'forbidden-self' | 'forbidden-role' | 'invalid-body' }

/**
 * Pure guardrail check — unit-testable without a DB. Rules:
 * - only an owner may edit flags (operator impersonation counts as owner);
 * - the target must be an existing manager/officer-grade member;
 * - never yourself, never an owner, never a platform-level role;
 * - the body carries exactly `{ permissions }` — role/status fields are
 *   rejected loudly rather than ignored, so nobody mistakes this endpoint
 *   for the operator's role-writing one.
 */
export function checkTeamEdit(
  actor: TeamActor | null,
  target: TeamTarget | null | undefined,
  body: unknown,
): TeamEditCheck {
  if (!actor || actor.role !== 'owner') return { ok: false, error: 'forbidden' }
  if (!target) return { ok: false, error: 'not-found' }
  if (target.userId === actor.userId) return { ok: false, error: 'forbidden-self' }
  if (!['manager', 'officer', 'client_user', 'client_admin'].includes(target.role)) {
    return { ok: false, error: 'forbidden-role' }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'invalid-body' }
  }
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'permissions') return { ok: false, error: 'invalid-body' }
  return { ok: true, permissions: normalizePermissions((body as { permissions?: unknown }).permissions) }
}

function actorOf(g: Guarded): TeamActor | null {
  if ('error' in g) return null
  if (g.impersonating) return { userId: `impersonator:${g.actor ?? 'operator'}`, role: 'owner' }
  if (!g.u) return null
  const role = g.u.memberships.find((m) => m.tenantId === g.ws)?.role ?? ''
  return { userId: g.u.userId, role }
}

teamRoutes.get('/team', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const actor = actorOf(g)
  if (!actor || actor.role !== 'owner') return c.json({ error: 'forbidden' }, 403)
  const db = sql()
  const rows = (await db`select u.id, u.email, cm.role, cm.permissions, u.status, c.must_change_pw
    from client_members cm
    join profiles u on u.id = cm.member_user_id
    left join auth_credentials c on c.user_id = u.id
    where cm.workspace_user_id = ${g.ws} order by u.email`) as unknown as
    { id: string; email: string; role: string; permissions: Permissions | null; status: string; must_change_pw: boolean | null }[]
  return c.json({
    members: rows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      role: String(r.role),
      permissions: (r.permissions as Permissions | null) ?? {},
      status: String(r.status ?? 'active'),
      mustChangePw: Boolean(r.must_change_pw),
    })),
  })
})

teamRoutes.patch('/team/:userId', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const targetId = c.req.param('userId')
  const body = await c.req.json().catch(() => null)
  const db = sql()
  const trows = (await db`select member_user_id, role, permissions from client_members
    where member_user_id = ${targetId} and workspace_user_id = ${g.ws}`) as unknown as
    { member_user_id: string; role: string; permissions: Permissions | null }[]
  const t = one<(typeof trows)[number]>(trows)
  const checked = checkTeamEdit(
    actorOf(g),
    t ? { userId: String(t.member_user_id), role: String(t.role) } : undefined,
    body,
  )
  if (!checked.ok) {
    const status = checked.error === 'not-found' ? 404 : checked.error === 'invalid-body' ? 400 : 403
    return c.json({ error: checked.error }, status as 400 | 403 | 404)
  }
  const before = (t?.permissions as Permissions | null) ?? {}
  await db`update client_members set permissions = ${JSON.stringify(checked.permissions)}::jsonb
    where member_user_id = ${targetId} and workspace_user_id = ${g.ws}`
  const actorUuid = !('error' in g) && !g.impersonating && g.u ? g.u.userId : null
  await db`insert into client_permission_audit (workspace_user_id, actor_user_id, target_member_id, action, before, after)
    values (${g.ws}, ${actorUuid}, ${targetId}, 'member.permissions.updated',
      ${JSON.stringify({ permissions: before })}::jsonb, ${JSON.stringify({ permissions: checked.permissions })}::jsonb)`
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  await withTenant(g.ws, 'owner', async () =>
    audit(g.ws, 'client_members', targetId, 'member.permissions.updated', g.actor,
      { permissions: checked.permissions }, ip))
  return c.json({ ok: true })
})
