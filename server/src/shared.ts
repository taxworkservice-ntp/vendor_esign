import { sql, withTenant } from '../../src/server/db'
import { hashPassword } from './auth'

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

// ── Login lockout (per-email, Postgres-backed) ───────────────────────────────
// 5 failed attempts → 15 minutes locked. Shared by the client and admin logins
// so both operations enforce the same account-level backstop behind their
// per-IP rate limits. Postgres-backed (login_lockouts, migration 030) so it
// holds on serverless/multi-instance, where a per-instance Map would silently
// stop working; falls back to a per-instance in-memory window when the table is
// absent — never throws, never blocks the flow. Moderate by design: the window
// is fixed (failures during a lock do not extend it further than one fresh
// window) and unknown emails count too, so the lock itself cannot be used to
// probe which accounts exist.

export const LOGIN_MAX_FAILS = 5
export const LOGIN_LOCK_MS = 15 * 60 * 1000

// Bounds scrypt's work factor: the floor is the product minimum, the ceiling
// keeps a megabyte-long input from burning CPU on every attempt.
export const MAX_PASSWORD_LEN = 128

export interface LockoutRecord {
  n: number
  until: number
}

/** Pure: is this record locking the account right now? Returns the lock expiry
 *  (ms epoch) or 0. Expired records read as unlocked. */
export function lockoutUntil(rec: LockoutRecord | undefined, now: number): number {
  if (!rec) return 0
  if (now > rec.until) return 0
  return rec.n >= LOGIN_MAX_FAILS ? rec.until : 0
}

/** Pure: the counter after one more failure. An expired record restarts at 1. */
export function nextLockout(rec: LockoutRecord | undefined, now: number): LockoutRecord {
  const base = rec && now <= rec.until ? rec.n : 0
  return { n: base + 1, until: now + LOGIN_LOCK_MS }
}

const lockMemory = new Map<string, LockoutRecord>()

/** Returns the lock expiry (ms epoch) or 0 when the email may attempt login. */
export async function loginLocked(email: string): Promise<number> {
  const now = Date.now()
  try {
    const rows = (await sql()`select fails, until from login_lockouts where email = ${email}`) as unknown as
      { fails: number; until: string }[]
    const r = rows[0]
    if (!r) return 0
    return lockoutUntil({ n: Number(r.fails), until: new Date(String(r.until)).getTime() }, now)
  } catch {
    return lockoutUntil(lockMemory.get(email), now)
  }
}

/**
 * Record one failed attempt. Returns whether the account is now locked and
 * whether this attempt crossed the threshold (`triggered` — callers audit
 * exactly that transition so a spray shows up once per account, not per try).
 */
export async function noteLoginFailure(email: string): Promise<{ locked: boolean; triggered: boolean }> {
  const now = Date.now()
  try {
    const db = sql()
    const rows = (await db`select fails, until from login_lockouts where email = ${email}`) as unknown as
      { fails: number; until: string }[]
    const prev = rows[0] ? { n: Number(rows[0].fails), until: new Date(String(rows[0].until)).getTime() } : undefined
    const wasLocked = lockoutUntil(prev, now) > 0
    const rec = nextLockout(prev, now)
    await db`insert into login_lockouts (email, fails, until) values (${email}, ${rec.n}, ${new Date(rec.until).toISOString()})
      on conflict (email) do update set fails = excluded.fails, until = excluded.until`
    const locked = rec.n >= LOGIN_MAX_FAILS
    return { locked, triggered: locked && !wasLocked }
  } catch {
    const prev = lockMemory.get(email)
    const wasLocked = lockoutUntil(prev, now) > 0
    const rec = nextLockout(prev, now)
    lockMemory.set(email, rec)
    const locked = rec.n >= LOGIN_MAX_FAILS
    return { locked, triggered: locked && !wasLocked }
  }
}

/** A successful login clears the counter (same email, both operations). */
export async function clearLoginFailures(email: string): Promise<void> {
  lockMemory.delete(email)
  try {
    await sql()`delete from login_lockouts where email = ${email}`
  } catch {
    /* memory already cleared */
  }
}

// Constant-work verify when the email is unknown — avoids leaking account
// existence through login timing. The hash is computed once and reused.
let dummy: string | null = null
export async function dummyPasswordHash(): Promise<string> {
  if (!dummy) dummy = await hashPassword('taxwork-dummy-password')
  return dummy
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
): Promise<string | null> {
  const db = sql()
  const rows = (await db`insert into audit_events (user_id, entity_type, entity_id, event_type, actor, metadata, ip)
    values (${tenantId}, ${entityType}, ${entityId}, ${eventType}, ${actor}, ${JSON.stringify(metadata ?? {})}, ${ip})
    returning id`) as unknown as { id: string }[]
  return rows[0] ? String(rows[0].id) : null
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
