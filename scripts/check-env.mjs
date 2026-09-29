// Env hygiene checks — `npm run check:env`
// 1) No secret-looking value may be exposed under a VITE_* name (Vite inlines
//    every VITE_* var into the client bundle).
// 2) Every key in .env.example is documented; unknown keys in .env.local warn.
// Exits non-zero on failure so CI can gate.
import { readFileSync, existsSync } from 'node:fs'

const SECRET_HINT = /(SECRET|SERVICE_ROLE|PASSWORD|PASSWD|TOKEN|PRIVATE|ACCESS_KEY|API_KEY|CREDENTIAL)/i
const SAFE_VITE = new Set(['VITE_API_BASE', 'VITE_ADMIN_API_BASE', 'VITE_FEATURE_VENDOR_MEMORY', 'VITE_APP_CLIENT_CODE'])

function parse(file) {
  if (!existsSync(file)) return null
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/)
    if (m) out[m[1]] = true
  }
  return out
}

const example = parse('.env.example')
if (!example) {
  console.error('FAIL: .env.example is missing')
  process.exit(1)
}

const files = ['.env', '.env.local', '.env.production', '.env.development']
let failed = false

for (const f of files) {
  const env = parse(f)
  if (!env) continue
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && SECRET_HINT.test(key) && !SAFE_VITE.has(key)) {
      console.error(`FAIL: ${f} exposes secret-looking var ${key} via VITE_* (inlined into the client bundle)`)
      failed = true
    }
    if (!example[key]) console.warn(`warn: ${key} in ${f} is not documented in .env.example`)
  }
}

// Sanity: required server-only vars should be documented.
for (const key of ['DATABASE_URL', 'ID_ENCRYPTION_KEY', 'ALLOWED_ORIGINS', 'CRON_SECRET']) {
  if (!example[key]) {
    console.warn(`warn: ${key} is not documented in .env.example`)
  }
}

console.log(failed ? 'check:env FAILED' : 'check:env OK')
process.exit(failed ? 1 : 0)
