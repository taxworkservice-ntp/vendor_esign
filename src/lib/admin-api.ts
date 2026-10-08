import { ADMIN_API_BASE, HAS_ADMIN_BASE } from './api-base'

// Where the admin operation lives. Two deployment shapes:
// - Separate admin deployment (VITE_ADMIN_API_BASE set): adminApp is served at
//   its root, so admin paths are /api/... as written.
// - Single-function deployment (Vercel Hobby): server/entry.ts mounts adminApp
//   at /api/admin-op, so admin paths need that prefix.
// The frontend previously called the two-port paths unconditionally, which 404
// on the single-function build: login succeeded but refresh() wiped the session
// and /admin bounced straight back to /login with no error.
const ADMIN_BASE = ADMIN_API_BASE
const ADMIN_PREFIX = HAS_ADMIN_BASE ? '' : '/api/admin-op'

/** Base URL for the admin operation. Empty in mock mode (no API base at all). */
export const ADMIN_API = ADMIN_BASE

/** Prefix an admin path (e.g. '/api/me') with the mount point when needed. */
export function adminPath(path: string): string {
  return `${ADMIN_API}${ADMIN_PREFIX}${path}`
}
