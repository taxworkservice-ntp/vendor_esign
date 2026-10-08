# Deploy — environment separation

`main` is the Vercel **production** branch. Any branch pushed to GitHub gets a
**preview** deployment. The risk to avoid: a preview that points at the
production database and login, so testing can read and mutate live data.

## Preview is forced to demo (mock) mode
Vercel sets `VERCEL_ENV=preview` at build time; `vite.config.ts` exposes it as
`__VERCEL_ENV__`, and `src/lib/api-base.ts` blanks the API base on preview. A
preview therefore **never talks to a real backend** — it runs entirely on the
seed data in `src/lib/mock*.ts`. The login screen shows the demo credentials
(`client@taxwork.local / demo1234`, `super@taxwork.local / demo1234`).

Consequence: the server-side paths (finalize guard, ID-gate withholding,
DB-backed limits) are **not** exercised on a mock preview — only the UI. To test
those, run locally against a database, or wire a separate preview DB branch and
lift the forcing (see below).

## Recommended matrix

| Variable | Production | Preview |
|---|---|---|
| `VITE_API_BASE`, `VITE_ADMIN_API_BASE` | production origin | **ignored — forced to mock** |
| `DATABASE_URL` / `NETLIFY_DATABASE_URL` | main Neon branch | not used (mock) — or a preview branch if forcing is lifted |
| `R2_*` (bucket/keys) | production bucket | empty (uploads degrade) or a separate bucket |
| `ID_ENCRYPTION_KEY` | production key | **a distinct key** |
| `CRON_SECRET` | production secret | **a distinct value** |
| Deployment Protection | — | **enabled** (Vercel Authentication or password) |

### Why
- **Mock mode.** Preview blanks the API base, so both portals run on seed users
  and local mock data (`src/lib/client-auth.tsx`, `src/lib/auth.tsx`). Ideal for
  reviewing UI changes with zero production access.
- **DB branch (optional).** To exercise the server on a preview, set the Preview
  `DATABASE_URL` to a Neon branch and remove the preview forcing in
  `src/lib/api-base.ts` (or gate it behind an explicit opt-out env).
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
