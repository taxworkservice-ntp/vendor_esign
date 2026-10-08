# Deploy — environment separation

`main` is the Vercel **production** branch. Any branch pushed to GitHub gets a
**preview** deployment. The risk to avoid: a preview that points at the
production database and login, so testing can read and mutate live data.

## Rule
Scope every environment variable in the Vercel dashboard per environment
(Production / Preview / Development). The default "all environments" is what
causes previews to share production.

## Recommended matrix

| Variable | Production | Preview |
|---|---|---|
| `VITE_API_BASE`, `VITE_ADMIN_API_BASE` | production origin | **empty → mock mode**, or a preview API |
| `DATABASE_URL` / `NETLIFY_DATABASE_URL` | main Neon branch | **preview branch**, or unset (mock) |
| `R2_*` (bucket/keys) | production bucket | empty (uploads degrade) or a separate bucket |
| `ID_ENCRYPTION_KEY` | production key | **a distinct key** |
| `CRON_SECRET` | production secret | **a distinct value** |
| Deployment Protection | — | **enabled** (Vercel Authentication or password) |

### Why
- **Mock mode.** With `VITE_API_BASE` empty, both portals run on seed users and
  local mock data (`src/lib/client-auth.tsx`, `src/lib/auth.tsx`). Ideal for
  reviewing UI-only changes with zero production access.
- **DB branch.** For previews that need realistic data, point Preview at a Neon
  branch created from `main`. Migrations run against the branch, not production.
- **Separate keys.** A shared `ID_ENCRYPTION_KEY` lets a preview decrypt
  production ciphertext (vendor tax IDs, invite tokens); a shared `CRON_SECRET`
  lets a preview trigger jobs.
- **Protection.** Preview URLs are public unless Deployment Protection is on.

## Migrations
Migrations are a deliberate **production** action:
```
npm run db:migrate     # applies db/migrations/*.up.sql (idempotent) to DATABASE_URL
```
Run it against the intended environment only. The code tolerates a missing
`rate_hits` / `gate_attempts` table (falls back to in-memory limits), so ordering
is not a hard failure — but apply 027 to get shared, durable limits.
