import { serve } from '@hono/node-server'
import { config as dotenv } from 'dotenv'
import { app } from './api'
import { adminApp } from './admin'

dotenv({ path: '.env.local' })
dotenv()

// Fail closed in production: an empty ALLOWED_ORIGINS makes the API reflect
// any origin with credentials, and an unset impersonation secret makes tw_imp
// forgeable with the dev key. Dev (empty env) is unaffected by design.
if (process.env.NODE_ENV === 'production') {
  const problems: string[] = []
  if (!(process.env.ALLOWED_ORIGINS ?? '').split(',').some((s) => s.trim())) {
    problems.push('ALLOWED_ORIGINS is empty — the API would reflect any origin with credentials')
  }
  if (!process.env.ID_ENCRYPTION_KEY && !process.env.CRON_SECRET) {
    problems.push('neither ID_ENCRYPTION_KEY nor CRON_SECRET is set — impersonation cookies would use the dev key')
  }
  if (problems.length) {
    for (const p of problems) console.error(`refusing to start: ${p}`)
    process.exit(1)
  }
}

// Two isolated operations, two ports, one codebase:
// - public client/vendor operation (no login): PORT (default 8787)
// - admin operation (login + tenants/users, tw_admin cookie, 12h sessions): ADMIN_PORT (default 8788)
// Bind 127.0.0.1 only — put behind a reverse proxy / VPN; add ADMIN_IP_ALLOWLIST for admin.
const port = Number(process.env.PORT ?? 8787)
const adminPort = Number(process.env.ADMIN_PORT ?? 8788)

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
console.log(`public api listening on http://127.0.0.1:${port} (localhost only)`)

if (adminPort !== port) {
  serve({ fetch: adminApp.fetch, port: adminPort, hostname: '127.0.0.1' })
  console.log(`admin api listening on http://127.0.0.1:${adminPort} (localhost only — restrict via ADMIN_IP_ALLOWLIST)`)
} else {
  console.log('ADMIN_PORT == PORT: admin routes NOT mounted separately — set ADMIN_PORT to isolate the admin operation')
}
