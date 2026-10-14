import { app } from './src/api'
import { adminApp } from './src/admin'

// Vercel Node.js function entry. esbuild bundles this into a single,
// self-contained api/entry.js at build time (scripts/build-api.mjs): Vercel
// transpiles .ts per-file without bundling, so the extensionless relative
// imports in the server graph cannot be resolved by Node's ESM loader.
//
// Vercel's /api filesystem routing only matches a single path segment for
// non-Next projects (catch-all `[...slug]` is Next-only). vercel.json rewrites
// every /api/:path* here and passes the remainder as `__route`; we rebuild the
// real path before handing off to Hono.
app.route('/api/admin-op', adminApp)

// Same fail-closed contract as server/src/index.ts, adapted to serverless: a
// misconfigured production deployment answers 500 on every request instead of
// serving traffic exposed. Checked once and cached; dev/preview unaffected.
let configChecked: boolean | null = null
function prodConfigOk(): boolean {
  if (configChecked !== null) return configChecked
  configChecked = true
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production') return true
  const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').some((s) => s.trim())
  const secret = !!process.env.ID_ENCRYPTION_KEY || !!process.env.CRON_SECRET
  if (!origins || !secret) {
    console.error('refusing to serve: production requires ALLOWED_ORIGINS and ID_ENCRYPTION_KEY (or CRON_SECRET)')
    configChecked = false
  }
  return configChecked
}

async function fetch(request: Request): Promise<Response> {
  if (!prodConfigOk()) {
    return new Response(JSON.stringify({ error: 'server-misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const url = new URL(request.url)
  const route = url.searchParams.get('__route')
  if (route === null) return app.fetch(request)

  url.searchParams.delete('__route')
  url.pathname = route ? `/api/${route}` : '/api'

  const init: RequestInit = { method: request.method, headers: request.headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer()
  return app.fetch(new Request(url.toString(), init))
}

export default { fetch }
