import { app } from '../server/src/api'
import { adminApp } from '../server/src/admin'

// Vercel Node.js function (fetch web-standard export).
//
// Vercel's /api filesystem routing only matches a single path segment for
// non-Next projects (catch-all `[...slug]` is Next-only). So vercel.json
// rewrites every /api/:path* to this one function and passes the remainder as
// `__route`; here we rebuild the real path before handing off to Hono.
//
// Local dev runs two isolated operations on two localhost ports
// (server/src/index.ts). Vercel exposes a single origin, so the admin
// operation is mounted under /api/admin-op:
//   public  -> /api/...
//   admin   -> /api/admin-op/api/...
// Point VITE_ADMIN_API_BASE at <origin>/api/admin-op.
app.route('/api/admin-op', adminApp)

async function fetch(request: Request): Promise<Response> {
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
