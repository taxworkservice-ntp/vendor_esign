import { cors } from 'hono/cors'

// CORS for the browser (client portal + admin) hitting the API on a different
// port/origin in dev. Credentials are required (httpOnly session cookies).
// ALLOWED_ORIGINS is a comma-separated allowlist; when empty we reflect the
// request origin (dev only) — never a bare "*" with credentials, which browsers reject.

export function corsMw() {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return cors({
    origin: (origin) => {
      if (!origin) return undefined
      if (allowed.length === 0) return origin
      return allowed.includes(origin) ? origin : undefined
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  })
}
