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
export async function withTenant<T>(tenantId: string, role: 'client' | 'bookkeeper', fn: () => Promise<T>): Promise<T> {
  const db = sql()
  await db`select set_config('app.tenant_id', ${tenantId}, true), set_config('app.role', ${role}, true)`
  return fn()
}
