# Test users (local / mock mode)

These credentials work only in **local mock mode** — i.e. when `VITE_API_BASE` is
empty (the default). They are hardcoded in `src/lib/mock-users.ts` and must never
be used in production.

## Client portal — `/login`

| Email | Password | Access |
| --- | --- | --- |
| `client@taxwork.local` | `demo1234` | Company **ABC** — **owner** (full access) |
| `admin@demo.co.th` | `demo1234` | Company **DEMO** — **owner** |
| `manager@demo.co.th` | `demo1234` | Company **DEMO** — **manager** (settings) |
| `user@demo.co.th` | `demo1234` | Company **DEMO** — **officer** (read-only) |

Roles follow the owner-only model: `owner` (top role, everything) · `manager` ·
`officer` (permission-gated). There is no separate system admin; the platform
operator is seeded as an `owner` (see `npm run db:seed-admin`).

## Admin — `/admin/login`

| Email | Password | Access |
| --- | --- | --- |
| `super@taxwork.local` | `demo1234` | Admin operation (operator), manages client workspaces |

## How to use

1. `npm run dev`
2. Open http://localhost:5173/login (client) or http://localhost:5173/admin/login (admin)
3. Enter a credential pair above. The login page also shows these in the amber
   “โหมดทดสอบ (ในเครื่องนี้)” box.

## Notes

- Mock mode only: when `VITE_API_BASE` is set, logins are validated by the server
  and these credentials are ignored. Real users are created by an owner/manager; the
  server generates a one-time temporary password (shown once) and forces a
  password change on first login.
- One user belongs to exactly one workspace; there is no tenant switcher. To see a
  different company's data, log in as that company's user.
