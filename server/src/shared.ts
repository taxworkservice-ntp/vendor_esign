import { sql, withTenant } from '../../src/server/db'

// Shared helpers for the two isolated operations:
// - public client/vendor operation (server/src/api.ts)
// - admin operation (server/src/admin.ts)
// Single source so numbering, audit, and tenant resolution never drift.

// PILOT_* remain as fallback for single-tenant installs without auth.
export const PILOT_TENANT = process.env.PILOT_TENANT ?? 'ABC'
export const PILOT_BE_YEAR = Number(process.env.PILOT_BE_YEAR ?? 2569)
export const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'
export const CLIENT_DISPLAY =
  process.env.CLIENT_DISPLAY ?? 'ABC (ชื่อ/ที่อยู่/เลขภาษีฉบับจริง — รอคอนเฟิร์ม [VERIFY])'

// neon() template queries return a union row type — normalize [0] access.
export function one<T>(rows: unknown): T | undefined {
  return (rows as T[] | undefined)?.[0]
}

// Minimal in-memory rate limit per operation instance (per-IP, 60s window).
// Pro note: behind multiple replicas move to Postgres or the proxy.
const hits = new Map<string, { n: number; reset: number }>()
export function rateLimited(key: string, max = 30): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || now > h.reset) {
    hits.set(key, { n: 1, reset: now + 60000 })
    return false
  }
  h.n += 1
  return h.n > max
}

export async function audit(
  tenantId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  actor: string | null,
  metadata: unknown,
  ip: string,
) {
  const db = sql()
  await db`insert into audit_events (user_id, entity_type, entity_id, event_type, actor, metadata, ip)
    values (${tenantId}, ${entityType}, ${entityId}, ${eventType}, ${actor}, ${JSON.stringify(metadata ?? {})}, ${ip})`
}

export async function withAuditTenant<T>(
  tenantId: string,
  role: string,
  userId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return withTenant(tenantId, role, fn, userId)
}

export async function tenantProfile(
  tenantId: string,
): Promise<{ code: string; beYear: number; display: string } | null> {
  const db = sql()
  const rows = (await db`select id, client_code, display_name, name, be_year
    from client_profiles where id = ${tenantId} and status = 'active'`) as unknown as
    { id: string; client_code: string | null; display_name: string | null; name: string; be_year: number }[]
  const t = rows[0]
  if (!t) return null
  return {
    code: t.client_code || t.id,
    beYear: Number(t.be_year ?? PILOT_BE_YEAR),
    display: t.display_name || t.name || CLIENT_DISPLAY,
  }
}
