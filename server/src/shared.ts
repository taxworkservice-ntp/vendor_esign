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

// Rate limiting and the vendor gate counter are stored in Postgres so the limit
// is shared across serverless instances and survives redeploys (migration 027).
// If the table is absent (migration not applied yet) or the DB blips, we fall
// back to a per-instance in-memory window — never throw, never block the flow.

const hits = new Map<string, { n: number; reset: number }>()
function memoryLimited(key: string, max: number): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || now > h.reset) {
    hits.set(key, { n: 1, reset: now + 60000 })
    return false
  }
  h.n += 1
  return h.n > max
}

export async function rateLimited(key: string, max = 30): Promise<boolean> {
  try {
    const db = sql()
    const rows = await db`
      insert into rate_hits (key, n, reset) values (${key}, 1, now() + interval '60 seconds')
      on conflict (key) do update set
        n = case when rate_hits.reset < now() then 1 else rate_hits.n + 1 end,
        reset = case when rate_hits.reset < now() then now() + interval '60 seconds' else rate_hits.reset end
      returning n`
    return Number(one<{ n: number }>(rows)?.n ?? 0) > max
  } catch {
    return memoryLimited(key, max)
  }
}

// Vendor gate: N wrong ID attempts per token per 10 minutes.
const GATE_WINDOW_MS = 10 * 60 * 1000
const gateMemory = new Map<string, { n: number; until: number }>()

export async function gateBlocked(tokenHash: string, max = 5): Promise<boolean> {
  try {
    const rows = await sql()`select n, until from gate_attempts where token_hash = ${tokenHash}`
    const r = one<{ n: number; until: string }>(rows)
    if (!r || new Date(r.until).getTime() < Date.now()) return false
    return Number(r.n) >= max
  } catch {
    const f = gateMemory.get(tokenHash)
    if (!f) return false
    if (Date.now() > f.until) return false
    return f.n >= max
  }
}

/** Record a failed attempt; returns how many tries remain (never below 0). */
export async function gateFail(tokenHash: string, max = 5): Promise<number> {
  try {
    const rows = await sql()`
      insert into gate_attempts (token_hash, n, until) values (${tokenHash}, 1, now() + interval '10 minutes')
      on conflict (token_hash) do update set
        n = case when gate_attempts.until < now() then 1 else gate_attempts.n + 1 end,
        until = case when gate_attempts.until < now() then now() + interval '10 minutes' else gate_attempts.until end
      returning n`
    return Math.max(0, max - Number(one<{ n: number }>(rows)?.n ?? 1))
  } catch {
    const f = gateMemory.get(tokenHash) ?? { n: 0, until: Date.now() + GATE_WINDOW_MS }
    f.n += 1
    gateMemory.set(tokenHash, f)
    return Math.max(0, max - f.n)
  }
}

export async function gateClear(tokenHash: string): Promise<void> {
  gateMemory.delete(tokenHash)
  try {
    await sql()`delete from gate_attempts where token_hash = ${tokenHash}`
  } catch {
    /* table absent — memory already cleared */
  }
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
