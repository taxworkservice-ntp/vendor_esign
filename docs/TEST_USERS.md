# Test users (local / mock mode)

These credentials work only in **local mock mode** — i.e. when `VITE_API_BASE` is
empty (the default). They are hardcoded in `src/lib/mock-users.ts` and must never
be used in production.

## Client portal — `/login`

| Email | Password | Access |
| --- | --- | --- |
| `client@taxwork.local` | `demo1234` | Client portal, company **ABC** |
| `admin@demo.co.th` | `demo1234` | Client portal, company **DEMO** (client_admin) |
| `user@demo.co.th` | `demo1234` | Client portal, company **DEMO** (client_user) |

## Admin — `/admin/login`

| Email | Password | Access |
| --- | --- | --- |
| `admin@taxwork.local` | `demo1234` | Admin: clients + users management (super_admin) |

## How to use

1. `npm run dev`
2. Open http://localhost:5173/login (client) or http://localhost:5173/admin/login (admin)
3. Enter a credential pair above. The login page also shows these in the amber
   “โหมดทดสอบ (mock)” box.

## Notes

- Mock mode only: when `VITE_API_BASE` is set, logins are validated by the server
  and these credentials are ignored. Real users are created by an admin; the
  server generates a one-time temporary password (shown once) and forces a
  password change on first login.
- One client user belongs to exactly one company; there is no tenant switcher.
  To see a different company's data, log in as that company's user.
