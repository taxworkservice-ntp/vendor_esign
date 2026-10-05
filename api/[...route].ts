import { handle } from '@hono/vercel'
import { app } from '../server/src/api'
import { adminApp } from '../server/src/admin'

// Vercel Node.js function (fetch web-standard export).
//
// Local dev runs two isolated operations on two localhost ports
// (server/src/index.ts). Vercel exposes a single origin, so the admin
// operation is mounted under /api/admin-op instead:
//   public  -> /api/...
//   admin   -> /api/admin-op/api/...
// Point VITE_ADMIN_API_BASE at <origin>/api/admin-op.
app.route('/api/admin-op', adminApp)

export default { fetch: handle(app) }
