// Read-only checks: tables, RLS, counter fn, config rows. Exits non-zero on failure.
// Usage: npm run db:verify
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'

dotenv({ path: '.env.local' })
dotenv()

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
if (!url) {
  console.error('Missing DATABASE_URL in .env.local — see docs/DB.md.')
  process.exit(1)
}
const sql = neon(url)
const fail = (m) => { console.error('VERIFY FAIL:', m); process.exitCode = 1 }
const ok = (m) => console.log('ok -', m)

const tables = await sql`select tablename from pg_tables where schemaname='public'`;
const have = new Set(tables.map((r) => r.tablename))
for (const t of ['client_profiles','profiles','auth_credentials','client_members','vendor_payees','vendor_payables','vendor_requests','vendor_authorizations','vendor_receipts','document_line_items','doc_number_sequences','wht_records','audit_events','config'])
  have.has(t) ? ok(`table ${t}`) : fail(`missing table ${t}`)

const rls = await sql`select relname from pg_class where relname in ('audit_events','vendor_receipts','vendor_payables') and relrowsecurity`;
rls.length === 3 ? ok('RLS enabled on core tables') : fail('RLS not enabled everywhere')

const fn = await sql`select proname from pg_proc where proname='generate_doc_number'`;
fn.length ? ok('generate_doc_number() present') : fail('numbering function missing')

try {
  const cfg = await sql`select count(*)::int as n from config where user_id='ABC'`;
  cfg[0].n >= 4 ? ok(`config rows (${cfg[0].n})`) : fail('config seed rows missing — run migrations')
} catch (e) { fail('config unreadable: ' + e.message) }

console.log(process.exitCode ? 'verify: FAILED' : 'verify: OK')
