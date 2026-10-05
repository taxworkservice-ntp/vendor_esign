// End-to-end smoke test vs live DB + running API (fake data only).
// Usage: npm run api:dev &  →  node scripts/smoke.mjs  →  kill %1
// Creates its own SMOKE-* rows, so reruns are safe. Exits non-zero on failure.
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AwsClient } from 'aws4fetch'

dotenv({ path: '.env.local' })
dotenv()

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787'
const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
if (!url) throw new Error('Missing DATABASE_URL')
const sql = neon(url)
const stamp = Date.now().toString(36).toUpperCase()

const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` (${extra})` : ''}`)
  if (!cond) process.exitCode = 1
}

// Storage check works against either backend: R2 when configured (the deployed
// server), else the local disk. Avoids a false failure on serverless.
const r2Ready = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
async function artifactExists(relPath) {
  if (!relPath) return false
  if (r2Ready) {
    const c = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    })
    const url = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET ?? 'vendor-esign'}/${relPath}`
    const res = await c.fetch(url)
    return res.ok
  }
  return existsSync(join(process.cwd(), 'storage', relPath))
}

const token = randomBytes(32).toString('hex')
const tokenHash = createHash('sha256').update(token).digest('hex')
// Known test ID (fake): gate expects this exact value.
const TEST_TAX_ID = '1101700230708'
const testTaxHash = createHash('sha256').update(TEST_TAX_ID).digest('hex')

// Fresh vendor + txn + request (idempotent reruns)
const v = await sql.query(
  `insert into vendor_payees (user_id, name, address, id_number_encrypted)
   values ('ABC','Smoke Test (fake)','Bangkok (fake)','enc:FAKE-SMOKE') returning id`)
const vendorId = v[0].id
const ref = `SMOKE-${stamp}`
const slip = `SMOKE-SLIP-${stamp}`
const t = await sql.query(
  `insert into vendor_payables (user_id, ref, vendor_id, payment_type, description,
    gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_reference, status, created_by,
    tax_id_hash, tax_id_last4)
   values ('ABC', $1, $2, 'ค่าบริการ', 'smoke test (fake)', 3000, 3, 90, 2910,
    CURRENT_DATE, $3, 'draft', 'smoke', $4, '0708') returning id`,
  [ref, vendorId, slip, testTaxHash])
const txnId = t[0].id
await sql.query(
  `insert into vendor_requests (user_id, transaction_id, token_hash, expires_at)
   values ('ABC', $1, $2, now() + interval '7 days')`,
  [txnId, tokenHash])
await sql.query(`update vendor_payables set status='sent' where id=$1`, [txnId])

// 1. vendor loads own txn
let r = await fetch(`${BASE}/api/vendor/${token}`)
check('GET vendor → 200', r.status === 200, `got ${r.status}`)
const payload = await r.json()
check('payload masked (no secrets)', payload.token_hash === undefined && payload.slip_file_path === undefined && Number(payload.netAmount) === 2910)
check('payload flags gate + prefill', payload.gated === true && payload.idLast4 === '0708' && !!payload.vendorName)

// 1b. direct sign without unlock is rejected
const sigPng = (await QRCode.toBuffer('smoke-signature', { width: 200 })).toString('base64')
const signBody = (name, addr) => JSON.stringify({
  vendorPrefix: 'นาย',
  vendorName: name, vendorAddress: addr,
  idNumberEncrypted: 'enc:FAKE-SMOKE', idLast4: '0708',
  signaturePng: `data:image/png;base64,${sigPng}`, consentVersion: 'v1',
})
r = await fetch(`${BASE}/api/vendor/${token}/sign`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: signBody('Smoke Test', 'Bangkok'),
})
check('sign without unlock → 403', r.status === 403, `got ${r.status}`)

// 1c. wrong Tax ID rejected, right one unlocks + prefills
r = await fetch(`${BASE}/api/vendor/${token}/unlock`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idNumber: '1101700230700' }),
})
check('unlock wrong ID → 401', r.status === 401, `got ${r.status}`)
r = await fetch(`${BASE}/api/vendor/${token}/unlock`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idNumber: TEST_TAX_ID }),
})
const unlocked = await r.json()
check('unlock right ID → 200 + prefill', r.status === 200 && unlocked.vendorName === 'Smoke Test (fake)', `got ${r.status}`)

// 2. sign with an edited address (correction must be recorded + reported)
r = await fetch(`${BASE}/api/vendor/${token}/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: signBody('Smoke Test (fake)', 'Chiang Mai (corrected)'),
})
const signed = await r.json()
check('POST sign → 200', r.status === 200, `got ${r.status}`)
check('correction reported', Array.isArray(signed.corrections) && signed.corrections.some((x) => x.field === 'address'),
  JSON.stringify(signed.corrections))

// 3. token reuse blocked
r = await fetch(`${BASE}/api/vendor/${token}`)
check('token reuse → 410', r.status === 410, `got ${r.status}`)

// 4. finalize → number + PDF + hash
r = await fetch(`${BASE}/api/transactions/${txnId}/finalize`, { method: 'POST' })
const fin = await r.json()
check('POST finalize → 200', r.status === 200, `got ${r.status} ${JSON.stringify(fin).slice(0, 120)}`)
check('number format', /^RCT-\d{3}-2569-\d{3}$/.test(fin.number ?? ''), fin.number)
check('sha256 format', /^[0-9a-f]{64}$/.test(fin.pdfSha256 ?? ''))
check('pdf stored', await artifactExists(fin.pdfPath), fin.pdfPath)

// 5. double-finalize blocked, verify page masked
r = await fetch(`${BASE}/api/transactions/${txnId}/finalize`, { method: 'POST' })
check('double finalize → 409', r.status === 409, `got ${r.status}`)
r = await fetch(`${BASE}/api/verify/${fin.verificationCode}`)
const vf = await r.json()
check('GET verify masked', r.status === 200 && vf.number === fin.number && !vf.slipReference)

// 6. audit trail written
const audit = await sql.query(
  `select count(*)::int n from audit_events where entity_id=$1`, [txnId])
check('audit events ≥3', audit[0].n >= 3, `got ${audit[0].n}`)

console.log(process.exitCode ? 'smoke: FAILED' : 'smoke: ALL PASS')
