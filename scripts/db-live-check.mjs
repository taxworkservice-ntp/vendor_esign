// Live-DB validation without a hosted database:
//   npm run db:live
// Starts an embedded Postgres, applies every migration in order, and asserts the
// schema, functions, RLS and a couple of real queries. Local only — no secrets.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'

const PORT = 55432
const DB = 'vendor_esign'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function splitStatements(text) {
  const out = []
  let buf = ''
  let inDollar = false
  for (const line of text.split('\n')) {
    const marks = (line.match(/\$\$/g) || []).length
    if (marks % 2 === 1) inDollar = !inDollar
    buf += line + '\n'
    if (!inDollar && /;\s*$/.test(line.trimEnd())) {
      if (buf.trim() && !/^--\s*$/.test(buf.trim())) out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf)
  return out.filter((s) => s.trim() && !/^(--.*\n)*\s*$/.test(s))
}

const pgServer = new EmbeddedPostgres({
  databaseDir: join(root, '.pgdata-live'),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
})

let client
let failures = 0
const ok = (m) => console.log('ok -', m)
const fail = (m) => {
  console.error('FAIL -', m)
  failures++
}

try {
  console.log('starting embedded postgres…')
  await pgServer.initialise()
  await pgServer.start()
  // The embedded cluster may default to a legacy locale (e.g. WIN874 on a Thai
  // Windows box); create an explicit UTF-8 database so Thai + box-drawing SQL
  // round-trips. Hosted Postgres (Neon) is UTF-8 by default.
  const admin = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query(`drop database if exists ${DB}`)
  await admin.query(`create database ${DB} with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`)
  await admin.end()
  client = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: DB })
  await client.connect()

  const migRoot = join(root, 'db', 'migrations')
  const files = readdirSync(migRoot).filter((f) => f.endsWith('.up.sql')).sort()
  for (const f of files) {
    const stmts = splitStatements(readFileSync(join(migRoot, f), 'utf8'))
    for (const s of stmts) await client.query(s)
    console.log(`${f}: ${stmts.length} statements applied`)
  }
  ok('all migrations applied')

  const hasTable = async (t) =>
    (await client.query(`select 1 from pg_tables where schemaname='public' and tablename=$1`, [t])).rowCount === 1
  for (const t of [
    'client_profiles', 'profiles', 'auth_credentials', 'client_members', 'vendor_payees', 'vendor_payables',
    'vendor_requests', 'vendor_authorizations', 'vendor_receipts', 'document_line_items', 'doc_number_sequences',
    'wht_vendors', 'wht_records', 'items', 'audit_events', 'config', 'sessions',
  ]) {
    ;(await hasTable(t)) ? ok(`table ${t}`) : fail(`missing table ${t}`)
  }

  const hasFn = async (name) =>
    (await client.query(`select 1 from pg_proc where proname=$1`, [name])).rowCount >= 1
  for (const fn of ['generate_doc_number', 'generate_wht_certificate_no', 'app_user_id']) {
    ;(await hasFn(fn)) ? ok(`function ${fn}`) : fail(`missing function ${fn}`)
  }

  const rls = await client.query(
    `select count(*)::int n from pg_class where relname in ('vendor_payables','vendor_receipts','wht_records','items') and relrowsecurity`,
  )
  rls.rows[0].n === 4 ? ok('RLS enabled on core tables') : fail(`RLS not enabled everywhere (${rls.rows[0].n}/4)`)

  // Seed a workspace + exercise the real queries.
  await client.query(`insert into client_profiles (id, name, client_code, display_name, status, be_year)
    values ('ABC','ABC','ABC','บริษัท ทดสอบ จำกัด','active',2569) on conflict do nothing`)

  const docNo = await client.query(`select generate_doc_number('ABC','vendor_receipt',2569,1) n`)
  docNo.rows[0].n === 'RCT-001-2569-001' ? ok(`generate_doc_number → ${docNo.rows[0].n}`) : fail(`doc number got ${docNo.rows[0].n}`)

  const docNo2 = await client.query(`select generate_doc_number('ABC','vendor_receipt',2569,1) n`)
  docNo2.rows[0].n === 'RCT-001-2569-002' ? ok(`doc number increments → ${docNo2.rows[0].n}`) : fail(`increment got ${docNo2.rows[0].n}`)

  const docNo3 = await client.query(`select generate_doc_number('ABC','vendor_receipt',2569,2) n`)
  docNo3.rows[0].n === 'RCT-002-2569-001' ? ok(`new vendor starts at 001 → ${docNo3.rows[0].n}`) : fail(`vendor series got ${docNo3.rows[0].n}`)

  await client.query(`insert into wht_vendors (user_id, name, tax_id, vendor_type) values ('ABC','ผู้ขาย ทดสอบ','1234567890123','individual')`)
  const cert = await client.query(`select generate_wht_certificate_no('ABC', '2026-09-18'::date) n`)
  cert.rows[0].n === '26091001' ? ok(`wht cert → ${cert.rows[0].n}`) : fail(`wht cert got ${cert.rows[0].n}`)

  // RLS smoke: enforced for a NON-owner role (superusers/owners bypass RLS).
  await client.query(`insert into items (user_id, name, unit, unit_price) values ('ABC','ค่าทดสอบ','งาน',100)`)
  await client.query(`drop role if exists rls_test`)
  await client.query(`create role rls_test`)
  await client.query(`grant usage on schema public to rls_test`)
  await client.query(`grant select on items to rls_test`)
  await client.query(`grant execute on function app_user_id() to rls_test`)
  await client.query(`grant execute on function app_is_bookkeeper() to rls_test`)
  await client.query(`grant execute on function app_is_super_admin() to rls_test`)
  await client.query(`set role rls_test`)
  await client.query(`select set_config('app.user_id','ABC',false), set_config('app.role','owner',false)`)
  const mine = await client.query(`select count(*)::int n from items`)
  await client.query(`select set_config('app.user_id','ZZZ',false)`)
  const notMine = await client.query(`select count(*)::int n from items`)
  await client.query(`reset role`)
  mine.rows[0].n >= 1 && notMine.rows[0].n === 0
    ? ok('RLS isolates rows by app.user_id (non-owner role)')
    : fail(`RLS isolation wrong (mine=${mine.rows[0].n}, other=${notMine.rows[0].n})`)

  // ── End-to-end flow (data contract) ──────────────────────────────────
  // Walk the lifecycle by writing the same rows the server writes, then assert
  // the read models (receipt register + void propagation + rate limit) agree.
  // Covers draft → sent → opened → signed → issued → void.
  const v = await client.query(
    `insert into vendor_payees (user_id, vendor_no, prefix, name, address, id_number_encrypted)
     values ('ABC', 1, 'นาย', 'ผู้ขาย โฟลว์', 'ที่อยู่ทดสอบ', '') returning id`)
  const vendorId = v.rows[0].id
  const p = await client.query(
    `insert into vendor_payables (user_id, ref, vendor_id, payment_type, description, line_items,
       gross_amount, wht_rate, wht_mode, wht_amount, net_amount, transfer_date, slip_reference, status, created_by)
     values ('ABC','TX-FLOW', $1, 'ค่าบริการ','ทดสอบโฟลว์','[]'::jsonb, 1000, 3, 'deduct', 30, 970, current_date, 'SLIP-FLOW', 'draft', 'flow')
     returning id`, [vendorId])
  const txnId = p.rows[0].id
  const rq = await client.query(
    `insert into vendor_requests (user_id, transaction_id, token_hash, token, expires_at)
     values ('ABC', $1, 'hash-flow', 'tok-flow', now() + interval '7 days') returning id`, [txnId])
  await client.query(`update vendor_payables set status='sent' where id=$1`, [txnId])
  await client.query(`update vendor_requests set opened_at=now() where id=$1`, [rq.rows[0].id])
  await client.query(`update vendor_payables set status='opened' where id=$1`, [txnId])
  await client.query(`update vendor_requests set unlocked_at=now() where id=$1`, [rq.rows[0].id])
  await client.query(
    `insert into vendor_authorizations (user_id, transaction_id, vendor_name, vendor_address, vendor_masked_id, signature_image_path, verification_method, consent_text_version)
     values ('ABC', $1, 'ผู้ขาย โฟลว์', 'ที่อยู่ทดสอบ', 'x-xxxx-xxxxx-12-34', 'signatures/flow.png', 'stub-deferred', 'v1')`, [txnId])
  await client.query(`update vendor_requests set used_at=now() where id=$1`, [rq.rows[0].id])
  await client.query(`update vendor_payables set status='signed' where id=$1`, [txnId])
  const num = await client.query(`select generate_doc_number('ABC','vendor_receipt',2569,1) n`)
  await client.query(
    `insert into vendor_receipts (user_id, transaction_id, number, issue_date, verification_code, status)
     values ('ABC', $1, $2, current_date, 'flowcode', 'issued')`, [txnId, num.rows[0].n])
  await client.query(`update vendor_payables set status='issued' where id=$1`, [txnId])
  const wv = await client.query(`select id from wht_vendors where user_id='ABC' limit 1`)
  await client.query(
    `insert into wht_records (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, description, status, certificate_no, source_transaction_id)
     values ('ABC', $1, 'pnd3', current_date, 1000, 3, 30, 'ค่าบริการ', 'active', generate_wht_certificate_no('ABC', current_date), $2)`,
    [wv.rows[0].id, txnId])

  const liveRegister = async () =>
    (await client.query(
      `select count(*)::int n from vendor_receipts r
       join vendor_payables p on p.id = r.transaction_id
       where r.user_id='ABC' and r.status='issued' and p.status not in ('void','cancelled')
         and r.transaction_id=$1`, [txnId])).rows[0].n
  ;(await liveRegister()) === 1
    ? ok('flow: issued receipt appears in the register')
    : fail('flow: register did not include the issued receipt')

  // Void propagation (mirrors POST /transactions/:id/void).
  await client.query(`update vendor_payables set status='void', void_reason='ทดสอบ' where id=$1`, [txnId])
  await client.query(`update vendor_receipts set status='void', void_reason='ทดสอบ', voided_at=now() where transaction_id=$1`, [txnId])
  await client.query(`update wht_records set status='void' where source_transaction_id=$1 and status='active'`, [txnId])
  ;(await liveRegister()) === 0
    ? ok('flow: voided receipt leaves the register')
    : fail('flow: voided receipt still counted')
  const whtAfter = await client.query(`select status from wht_records where source_transaction_id=$1`, [txnId])
  whtAfter.rows[0]?.status === 'void'
    ? ok('flow: WHT certificate voided with the receipt')
    : fail('flow: WHT certificate not voided')

  // Rate-limit table upsert (migration 027).
  await client.query(`insert into rate_hits (key, n, reset) values ('k', 1, now() + interval '60s')
    on conflict (key) do update set n = rate_hits.n + 1 returning n`)
  const r2 = await client.query(`insert into rate_hits (key, n, reset) values ('k', 1, now() + interval '60s')
    on conflict (key) do update set n = rate_hits.n + 1 returning n`)
  r2.rows[0].n === 2 ? ok('flow: rate_hits upsert increments') : fail(`flow: rate_hits got ${r2.rows[0].n}`)

  // Vendor invite → approve (schema + duplicate detection).
  await client.query(
    `insert into vendor_invites (user_id, token_hash, expires_at, status, name, address, tax_id_hash, bank_name, account_holder, submitted_at)
     values ('ABC','invite-hash', now() + interval '30 days','submitted','ผู้ขาย เชิญ','ที่อยู่ทดสอบ','hash-invite','กสิกร','ผู้ขาย เชิญ', now())`)
  await client.query(
    `insert into vendor_payees (user_id, vendor_no, prefix, name, address, id_number_encrypted, id_number_hash, bank_name, account_holder)
     values ('ABC', (select coalesce(max(vendor_no),0)+1 from vendor_payees where user_id='ABC'), 'นาย','ผู้ขาย เชิญ','ที่อยู่ทดสอบ','', 'hash-invite','กสิกร','ผู้ขาย เชิญ')`)
  const dup = await client.query(
    `select (select v.id from vendor_payees v where v.user_id=i.user_id and v.id_number_hash=i.tax_id_hash limit 1) as dup
     from vendor_invites i where i.token_hash='invite-hash'`)
  dup.rows[0].dup
    ? ok('flow: invite duplicate detection finds the existing vendor')
    : fail('flow: duplicate detection failed')
  await client.query(
    `update vendor_invites set status='approved',
       vendor_id=(select v.id from vendor_payees v where v.user_id='ABC' and v.id_number_hash='hash-invite' limit 1)
     where token_hash='invite-hash'`)
  const ap = await client.query(`select status, vendor_id from vendor_invites where token_hash='invite-hash'`)
  ap.rows[0].status === 'approved' && ap.rows[0].vendor_id
    ? ok('flow: approved invite links the created vendor')
    : fail('flow: approve did not link a vendor')
} catch (e) {
  fail(`exception: ${e.message}`)
} finally {
  try {
    await client?.end()
  } catch { /* ignore */ }
  try {
    await pgServer.stop()
  } catch { /* ignore */ }
}

console.log(failures ? `\ndb:live FAILED (${failures})` : '\ndb:live OK')
process.exit(failures ? 1 : 0)
