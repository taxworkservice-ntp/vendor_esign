import { neon } from '@neondatabase/serverless'

// Server-only. Never import from browser code.
// Reads pooled Neon URL from env (set in .env.local, gitignored).
// Supports both plain Postgres hosts and Netlify DB.

function connectionString(): string {
  const url =
    process.env.NETLIFY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.NEON_DATABASE_URL ??
    ''
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL — copy the pooled connection string from Netlify (Site → Data → cold-meadow-09162217 → Connect) into .env.local. See docs/DB.md.',
    )
  }
  return url
}

let cached: ReturnType<typeof neon> | null = null
export function sql() {
  if (!cached) cached = neon(connectionString())
  return cached
}

// Per-request tenant isolation for RLS: call at the start of every server txn.
// app.user_id is the WORKSPACE key (host RLS reads it via app_user_id(), which
// becomes auth.uid() on the Supabase move). actorId is the audit actor only.
export type AppRole = 'client' | 'client_user' | 'client_admin' | 'owner' | 'manager' | 'officer' | 'bookkeeper' | 'super_admin'
export async function withTenant<T>(tenantId: string, role: string, fn: () => Promise<T>, actorId?: string): Promise<T> {
  const db = sql()
  await db`select set_config('app.user_id', ${tenantId}, true),
    set_config('app.tenant_id', ${tenantId}, true),
    set_config('app.role', ${role}, true)`
  if (actorId) await db`select set_config('app.actor_id', ${actorId}, true)`
  return fn()
}
