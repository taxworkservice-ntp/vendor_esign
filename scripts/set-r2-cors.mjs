// Sets the R2 bucket CORS policy so the browser can PUT presigned uploads
// (WHT signature/stamp) directly to R2. Without this the browser preflight
// fails and "upload signature and stamp" silently breaks.
//
// Usage:
//   CF_API_TOKEN=... CF_ACCOUNT_ID=... R2_BUCKET=vendor-esign \
//   ALLOWED_ORIGINS=https://app.example.com,http://localhost:5173 npm run r2:cors
import { config as dotenv } from 'dotenv'
dotenv({ path: '.env.local' })
dotenv()

const token = process.env.CF_API_TOKEN ?? ''
const account = process.env.CF_ACCOUNT_ID ?? ''
const bucket = process.env.R2_BUCKET ?? 'vendor-esign'
const origins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!token || !account) {
  console.error('Set CF_API_TOKEN and CF_ACCOUNT_ID.')
  process.exit(1)
}
if (origins.length === 0) {
  console.error('Set ALLOWED_ORIGINS (comma-separated) — e.g. https://app.example.com,http://localhost:5173')
  process.exit(1)
}

const body = {
  rules: [
    {
      allowed: { origins, methods: ['GET', 'PUT', 'HEAD'], headers: ['*'] },
      exposeHeaders: ['ETag'],
      maxAgeSeconds: 3600,
    },
  ],
}

const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/cors`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const j = await r.json().catch(() => ({}))
if (!r.ok || j.success === false) {
  console.error('r2:cors failed', r.status, JSON.stringify(j.errors ?? j))
  process.exit(1)
}
console.log(`r2:cors OK — bucket=${bucket} origins=${origins.join(', ')}`)
