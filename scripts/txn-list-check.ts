// Executes the REAL transaction-list SQL against an embedded Postgres.
//
//   npm run db:list
//
// The unit tests in server/src/txn-sql.test.ts assert the shape of the
// generated fragments. This asserts they actually run and return the right
// numbers: paging, ordering, the aggregates, and mock/server filter parity.
// It reuses the builder rather than restating the SQL, so the two cannot drift.
//
// Local only — no secrets, no hosted database.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { limitClause, orderByClause, totalsClause, whereClause } from '../server/src/txn-sql'
import { resolveStored } from '../server/src/storage'
import { whtByFormClause, whtTotalsClause, whtWhereClause } from '../server/src/wht-sql'
import { parseWhtListQuery } from '../src/lib/wht-list-query'
import { summarizeWht } from '../src/lib/wht-summary'
import { parseListQuery } from '../src/lib/txn-list-query'
import { emptyFilters, filterTransactions, sortTransactions, summarize } from '../src/lib/txn-filters'
import type { PaymentTransaction } from '../src/lib/types'

// Separate port from `db:live` (55432) so the two checks never collide. The
// data dir name is suffixed per-check because Postgres keys a shared-memory
// block off it: a previous run that died without stopping leaves that block
// behind and every later initdb on the same name fails with
// "pre-existing shared memory block is still in use".
const PORT = 55434
const DATA_DIR = '.pgdata-txnlist'
const DB = 'vendor_esign_list'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WS = 'ABC'

function splitStatements(text: string): string[] {
  const out: string[] = []
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

let failures = 0
const ok = (m: string) => console.log('ok -', m)
const fail = (m: string) => {
  console.error('FAIL -', m)
  failures++
}
const eq = (actual: unknown, expected: unknown, m: string) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? ok(m) : fail(`${m} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)

// Migration 008 moved ids to uuid, so rows are seeded with real uuids. The
// assertions speak in short labels to stay readable.
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const V1 = uuid(1)
const V2 = uuid(2)
const LABEL: Record<string, string> = {}
const tid = (n: number) => {
  const u = uuid(100 + n)
  LABEL[u] = `t${n}`
  return u
}
const label = (u: string) => LABEL[u] ?? u

const pgServer = new EmbeddedPostgres({
  databaseDir: join(root, DATA_DIR),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
})

let client: pg.Client | undefined

/** Runs the real list query through the real builder. */
async function list(params: string) {
  const q = parseListQuery(new URLSearchParams(params))
  const w = whereClause(q, WS)
  const rows = await client!.query(
    `select p.id, p.status, p.net_amount, p.gross_amount, p.wht_amount, p.transfer_date, p.slip_reference, v.name as vendor_name
     from vendor_payables p join vendor_payees v on v.id = p.vendor_id
     where ${w.text} ${orderByClause(q.sort)} ${limitClause(q)}`,
    w.params as unknown as unknown[],
  )
  const t = totalsClause(q, WS)
  const totals = (await client!.query(t.text, t.params as unknown as unknown[])).rows[0]
  return {
    ids: rows.rows.map((r: { id: string }) => label(r.id)),
    totals: {
      count: Number(totals.count),
      net: Number(totals.net),
      payableCount: Number(totals.payable_count),
      payableNet: Number(totals.payable_net),
      voidedCount: Number(totals.voided_count),
    },
  }
}

try {
  console.log('starting embedded postgres…')
  await pgServer.initialise()
  await pgServer.start()
  const admin = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query(`drop database if exists ${DB}`)
  await admin.query(`create database ${DB} with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`)
  await admin.end()
  client = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: DB })
  await client.connect()

  for (const f of readdirSync(join(root, 'db', 'migrations')).filter((f) => f.endsWith('.up.sql')).sort()) {
    for (const s of splitStatements(readFileSync(join(root, 'db', 'migrations', f), 'utf8'))) await client.query(s)
  }
  ok('all migrations applied (incl. 014)')

  // ── Migration 014: the slip-reference fix ───────────────────────────────
  // Matched on the column set, not the name: 008 renamed the table and column
  // but Postgres keeps the ORIGINAL constraint name, so a name-based check
  // would miss a constraint that is still very much present. conkey is
  // compared against an explicitly ordered array — an unordered array_agg never
  // matches, which is how an earlier version of this check passed vacuously.
  const cols = await client.query<{ attnum: number; attname: string }>(
    `select attname, attnum from pg_attribute
      where attrelid = 'vendor_payables'::regclass and attname in ('user_id','slip_reference')`,
  )
  const want = cols.rows.map((r) => r.attnum).sort((a, b) => a - b)
  const cons = await client.query<{ conname: string; conkey: number[] }>(
    `select conname, conkey from pg_constraint where conrelid = 'vendor_payables'::regclass and contype = 'u'`,
  )
  const offenders = cons.rows.filter((r) => JSON.stringify([...r.conkey].sort((a, b) => a - b)) === JSON.stringify(want))
  offenders.length === 0
    ? ok('014: table-level slip_reference UNIQUE dropped')
    : fail(`014: slip_reference table constraint still present as ${offenders.map((o) => o.conname).join(', ')}`)

  const idx = await client.query(
    `select indexname from pg_indexes where tablename='vendor_payables' and indexname in
     ('uq_vp_slip_reference','idx_vp_user_date','idx_vp_user_status_date','idx_vp_user_net') order by 1`,
  )
  eq(
    idx.rows.map((r: { indexname: string }) => r.indexname),
    ['idx_vp_user_date', 'idx_vp_user_net', 'idx_vp_user_status_date', 'uq_vp_slip_reference'],
    '014: all four indexes created',
  )

  // Two slip-less transactions per workspace used to be impossible (UNIQUE on
  // a NOT NULL ''), which broke the second POST /transactions.
  await client.query(`insert into vendor_payees (id, user_id, name, address, id_number_encrypted) values ($1,$2,'สมชาย','กรุงเทพ','x')`, [
    V1,
    WS,
  ])
  const ins = (n: number, ref: string, slip: string, status: string, date: string, gross: number, wht: number, net: number) =>
    client!.query(
      `insert into vendor_payables (id, user_id, ref, vendor_id, payment_type, description, gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_reference, status)
       values ($1,$2,$3,$4,'ค่าบริการ','งาน',$5,0,$6,$7,$8,$9,$10)`,
      [tid(n), WS, ref, V1, gross, wht, net, date, slip, status],
    )
  await ins(1, 'TX-1', '', 'draft', '2026-09-01', 1000, 0, 1000)
  await ins(2, 'TX-2', '', 'sent', '2026-09-02', 2000, 60, 1940)
  ok('014: two slip-less transactions in one workspace (previously a 23505)')

  await ins(3, 'TX-3', 'TRF-1', 'issued', '2026-09-03', 3000, 90, 2910)
  await ins(4, 'TX-4', 'TRF-2', 'void', '2026-09-04', 4000, 0, 4000)
  await ins(5, 'TX-5', 'TRF-3', 'cancelled', '2026-09-04', 5000, 0, 5000)
  await ins(6, 'TX-6', 'TRF-4', 'signed', '2026-09-05', 6000, 180, 5820)
  await ins(7, 'TX-7', 'TRF-5', 'issued', '2026-08-20', 7000, 0, 7000)
  // t9 and t10 deliberately share t6's transfer date: without the p.id
  // tiebreaker in ORDER BY, these two can straddle a page boundary.
  await ins(9, 'TX-9', 'TRF-6', 'issued', '2026-09-05', 100, 0, 100)
  await ins(10, 'TX-10', 'TRF-7', 'issued', '2026-09-05', 100, 0, 100)

  let dup = false
  try {
    await ins(8, 'TX-8', 'TRF-1', 'draft', '2026-09-06', 100, 0, 100)
  } catch {
    dup = true
  }
  dup ? ok('duplicate slip reference still rejected') : fail('duplicate slip reference was accepted')

  // ── The list query itself ───────────────────────────────────────────────
  // September holds t1..t6 + t9 + t10 = 8 rows; t7 is August.
  const all = await list('month=2026-09&sort=date-desc')
  eq(all.ids, ['t6', 't9', 't10', 't4', 't5', 't3', 't2', 't1'], 'month scope + date-desc')
  eq(all.totals.count, 8, 'totals cover the whole filtered set, not the page')
  eq(all.totals.payableCount, 6, 'payable excludes void + cancelled')
  eq(all.totals.voidedCount, 2, 'voided count')
  eq(all.totals.payableNet, 1000 + 1940 + 2910 + 5820 + 100 + 100, 'payable net')
  eq(all.totals.net, 1000 + 1940 + 2910 + 5820 + 100 + 100 + 4000 + 5000, 'gross net includes voided')

  // Paging partitions the set with no gaps and no repeats.
  const p1 = await list('month=2026-09&sort=date-desc&limit=2&offset=0')
  const p2 = await list('month=2026-09&sort=date-desc&limit=2&offset=2')
  const p3 = await list('month=2026-09&sort=date-desc&limit=2&offset=4')
  const p4 = await list('month=2026-09&sort=date-desc&limit=2&offset=6')
  eq([p1.ids, p2.ids, p3.ids, p4.ids], [['t6', 't9'], ['t10', 't4'], ['t5', 't3'], ['t2', 't1']], 'limit/offset pages cleanly')
  eq(p1.totals.count, 8, 'totals identical on every page')
  eq(p1.totals.payableNet, p4.totals.payableNet, 'totals stable across pages')

  // Export sentinel: limit=0 returns everything.
  eq((await list('month=2026-09&sort=date-desc&limit=0')).ids.length, 8, 'limit=0 exports the full set')

  // Tied dates must page deterministically.
  const tieA = await list('month=2026-09&sort=date-asc&limit=3&offset=5')
  const tieB = await list('month=2026-09&sort=date-asc&limit=3&offset=5')
  eq(tieA.ids, tieB.ids, 'tied dates page identically twice')
  eq(tieA.ids, ['t6', 't9', 't10'], 'tie broken by id, not by physical row order')

  // Filters
  eq((await list('month=2026-09&status=active')).ids, ['t6', 't2', 't1'], 'status group active = draft+sent+opened+signed')
  eq((await list('month=2026-09&status=voided')).ids, ['t4', 't5'], 'status group voided')
  eq((await list('month=2026-09&slip=with')).ids.length, 6, 'slip=with')
  eq((await list('month=2026-09&slip=without')).ids, ['t2', 't1'], 'slip=without')
  eq((await list('month=2026-09&min=3000')).ids, ['t6', 't4', 't5'], 'min net bound')
  eq((await list('month=2026-09&max=2000')).ids, ['t9', 't10', 't2', 't1'], 'max net bound (date-desc)')
  eq((await list('from=2026-09-01&to=2026-09-03')).ids, ['t3', 't2', 't1'], 'explicit from/to range (no month)')
  // A range sent alongside a month is dropped by the validator, so the month
  // alone decides — a hand-edited URL cannot half-apply a range.
  eq((await list('month=2026-09&from=2026-09-04')).ids, ['t6', 't9', 't10', 't4', 't5', 't3', 't2', 't1'], 'month wins over a stray from')
  eq((await list('month=2026-08')).ids, ['t7'], 'month isolation')
  eq((await list('q=' + encodeURIComponent('สมชาย'))).ids.length, 9, 'Thai search matches the vendor')
  eq((await list('q=' + encodeURIComponent('TRF-3'))).ids, ['t5'], 'search matches the slip reference')
  eq((await list('q=%25')).ids.length, 0, 'a literal % is escaped, not a wildcard')
  eq((await list('sort=net-desc&limit=1')).ids, ['t7'], 'sort by net desc')
  eq((await list('month=2026-09')).ids.length, 8, 'an absent limit falls back to the default page size')

  // Tenant isolation: another workspace exists but must not appear.
  await client.query(`insert into client_profiles (id, name, client_code, status, be_year) values ('ZZZ','อื่น','ZZZ','active',2569)`)
  await client.query(`insert into vendor_payees (id, user_id, name, address, id_number_encrypted) values ($1,'ZZZ','อื่น','กรุงเทพ','x')`, [V2])
  await client.query(
    `insert into vendor_payables (user_id, ref, vendor_id, payment_type, description, gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_reference, status)
     values ('ZZZ','TX-99',$1,'ค่าบริการ','งาน',999,0,0,999,'2026-09-01','','draft')`,
    [V2],
  )
  const scoped = whereClause(parseListQuery(new URLSearchParams('month=2026-09')), WS)
  eq(scoped.params[0], WS, 'tenant scope is the first bound parameter')
  const seen = await client.query(
    `select count(*)::int n from vendor_payables p join vendor_payees v on v.id = p.vendor_id where ${scoped.text}`,
    scoped.params as unknown as unknown[],
  )
  seen.rows[0].n === 8 ? ok('WHERE excludes the other workspace') : fail(`tenant leak: ${seen.rows[0].n}`)

  // ── The attention filter: SQL must agree with the client predicate ──────
  // Lifecycle timestamps are seeded far from the 3-day boundary so a second of
  // clock skew between this process and the database cannot flip a result.
  // t2: sent 30d ago, opened 20d ago -> stale.  t11: sent 40d ago, opened 1h
  // ago -> engaged recently, not stale.  t1: draft 5d old -> stale draft.
  // t12: sent 1d ago with no slip -> missing slip.  t3: issued with a slip.
  await ins(11, 'TX-11', 'TRF-8', 'sent', '2026-09-07', 800, 0, 800)
  await ins(12, 'TX-12', '', 'sent', '2026-09-08', 900, 0, 900)
  for (const [n, created, opened] of [
    [2, 30, 20],
    [11, 40, 0],
  ] as const) {
    await client.query(
      `insert into vendor_requests (user_id, transaction_id, token_hash, token, expires_at, created_at, opened_at)
       values ($1,$2,$3,$4, now() + interval '7 days', now() - make_interval(days => $5::int),
               now() - make_interval(days => $6::int))`,
      [WS, tid(n), `hash${n}`, `tok${n}`, created, opened],
    )
  }
  await client.query(`update vendor_payables set created_at = now() - interval '5 days' where id = $1`, [tid(1)])
  await client.query(`update vendor_payables set created_at = now() - interval '1 day' where id = $1`, [tid(12)])

  const attention = await list('month=2026-09&attention=1&sort=date-desc')
  eq(attention.ids, ['t12', 't2', 't1'], 'attention filter: stale sent, stale draft, missing slip')
  eq((await list('month=2026-09')).ids.includes('t11'), true, 't11 is listed when the filter is off')
  eq(attention.ids.includes('t11'), false, 'a link opened an hour ago is not flagged')
  eq(attention.ids.includes('t3'), false, 'an issued row with a slip is not flagged')
  eq(attention.totals.count, 3, 'totals respect the attention filter')

  // ── Authorization: the client's receipt must read the VENDOR's snapshot ──
  // finalize builds the issued PDF from vendor_authorizations. If the client's
  // receipt reads its own vendor_payees row instead, the two documents can show
  // different spellings of the same person — the defect this query guards.
  await client.query(`update vendor_payees set prefix = 'นาย', name = 'สมชาย การช่าง', address = 'ที่อยู่เดิมของลูกค้า' where id = $1`, [V1])
  await client.query(
    `insert into vendor_authorizations (user_id, transaction_id, vendor_prefix, vendor_name, vendor_address, vendor_masked_id, signature_image_path, signed_at)
     values ($1,$2,'นาง','สมชาย ช่างซ่อม','ที่อยู่ตามที่ผู้ขายยืนยัน','x-xxxx-xxxxx-67-89','ABC/signatures/missing.png', now() - interval '2 days')`,
    [WS, tid(6)],
  )

  const authRow = await client.query<{
    vendor_prefix: string; vendor_name: string; vendor_address: string; signature_image_path: string
    client_prefix: string; client_name: string; client_address: string
  }>(
    `select a.vendor_prefix, a.vendor_name, a.vendor_address, a.signature_image_path,
       v.prefix as client_prefix, v.name as client_name, v.address as client_address
     from vendor_authorizations a
     join vendor_payees v on v.id = (select vendor_id from vendor_payables where id = a.transaction_id and user_id = a.user_id)
     where a.transaction_id = $1 and a.user_id = $2`,
    [tid(6), WS],
  )
  const au = authRow.rows[0]
  au
    ? ok('authorization join returns the vendor snapshot')
    : fail('authorization join returned nothing')

  if (au) {
    eq(au.vendor_name, 'สมชาย ช่างซ่อม', 'authorized name wins over the client record')
    eq(au.client_name, 'สมชาย การช่าง', 'client record is still available for the diff')
    // Every field the vendor corrected, so the client can be told.
    eq(
      [au.vendor_prefix !== au.client_prefix, au.vendor_name !== au.client_name, au.vendor_address !== au.client_address],
      [true, true, true],
      'corrections detected for prefix, name and address',
    )
  }

  // Another workspace's authorization must be unreachable even by transaction id.
  await client.query(`insert into client_profiles (id, name, client_code, status, be_year) values ('ZZZ','อื่น','ZZZ','active',2569) on conflict do nothing`)
  const leak = await client.query(
    `select count(*)::int n from vendor_authorizations where transaction_id = $1 and user_id = $2`,
    [tid(6), 'ZZZ'],
  )
  leak.rows[0].n === 0 ? ok("another workspace's authorization is not returned") : fail('authorization leak')

  // The stored image is intentionally absent; the endpoint must report that
  // honestly rather than pretending the row is unsigned.
  const sigMissing = resolveStored(WS, au?.signature_image_path ?? '')
  sigMissing === null ? ok('a missing signature file resolves to null, not a crash') : fail('resolveStored invented a path')

  // ── WHT register: aggregate must match the mock's reference maths ───────
  // The register had no totals at all, so a bookkeeper added up rows by eye to
  // reconcile against a filed return. These assert the SQL aggregate agrees with
  // summarizeWht(), the mock path's implementation.
  const wv1 = uuid(500)
  const wv2 = uuid(501)
  await client.query(
    `insert into wht_vendors (id, user_id, name, tax_id, address, vendor_type) values ($1,$2,'สมชาย ช่าง','1234567890123','กรุงเทพ','individual'), ($3,$2,'บริษัท ก จำกัด','0999999999999','กรุงเทพ','company')`,
    [wv1, WS, wv2],
  )
  const insWht = (n: number, vendor: string, form: string, date: string, amount: number, wht: number, status = 'active') =>
    client!.query(
      `insert into wht_records (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, status, certificate_no)
       values ($1,$2,$3,$4,$5,3,$6,$7,$8)`,
      [WS, vendor, form, date, amount, wht, status, `260900${n}`],
    )
  await insWht(1, wv1, 'pnd3', '2026-09-02', 1000, 30)
  await insWht(2, wv1, 'pnd3', '2026-09-05', 2000, 60, 'done')
  await insWht(3, wv2, 'pnd53', '2026-09-09', 5000, 150)
  await insWht(4, wv2, 'pnd53', '2026-08-14', 7000, 210) // different month

  const whtRun = async (s: string) => {
    const q = parseWhtListQuery(new URLSearchParams(s))
    const t = whtTotalsClause(q, WS)
    const f = whtByFormClause(q, WS)
    const res = (await client!.query(t.text, t.params as never[])) as unknown as { rows: Record<string, unknown>[] }
    const rows = res.rows[0]
    if (!rows) {
      console.error('DEBUG whtTotalsClause returned no rows:\n' + t.text)
      console.error('DEBUG params:', JSON.stringify(t.params))
    }
    const formRes = (await client!.query(f.text, f.params as never[])) as unknown as {
      rows: { form_type: string; count: number; amount: string; wht_amount: string }[]
    }
    const forms = formRes.rows
    return {
      count: Number(rows.count),
      amount: Number(rows.amount),
      whtAmount: Number(rows.wht_amount),
      filedCount: Number(rows.filed_count),
      activeCount: Number(rows.active_count),
      vendors: Number(rows.vendors),
      byForm: forms.map((x) => ({
        formType: x.form_type,
        count: Number(x.count),
        amount: Number(x.amount),
        whtAmount: Number(x.wht_amount),
      })),
    }
  }

  const sep = await whtRun('month=2026-09')
  eq(sep.count, 3, 'WHT: month scope excludes the August certificate')
  eq(sep.amount, 8000, 'WHT: total base amount')
  eq(sep.whtAmount, 240, 'WHT: total tax withheld')
  eq(sep.filedCount, 1, 'WHT: filed count')
  eq(sep.activeCount, 2, 'WHT: outstanding count')
  eq(sep.vendors, 2, 'WHT: distinct vendors')
  eq(sep.byForm.map((f) => f.formType), ['pnd3', 'pnd53'], 'WHT: per-form breakdown')
  eq(sep.byForm[1], { formType: 'pnd53', count: 1, amount: 5000, whtAmount: 150 }, 'WHT: form totals')
  // The form rows must add up to the headline, or the breakdown is decorative.
  eq(sep.byForm.reduce((n, f) => n + f.amount, 0), sep.amount, 'WHT: form rows sum to the total')
  eq(sep.byForm.reduce((n, f) => n + f.whtAmount, 0), sep.whtAmount, 'WHT: form tax sums to the total')

  const doneOnly = await whtRun('month=2026-09&status=done')
  eq(doneOnly.count, 1, 'WHT: status filter narrows the aggregate too')
  eq(doneOnly.amount, 2000, 'WHT: filtered aggregate covers the whole filtered set')

  const pnd53 = await whtRun('month=2026-09&formType=pnd53')
  eq(pnd53.count, 1, 'WHT: form filter narrows the aggregate')
  eq(pnd53.amount, 5000, 'WHT: form-filtered amount')
  eq((await whtRun('')).count, 4, 'WHT: all-time aggregate includes both months')

  // The SQL aggregate must agree with the mock reference implementation.
  const mockWht = summarizeWht([
    { id: 'a', tenantId: WS, vendorId: wv1, formType: 'pnd3', issueDate: '2026-09-02', amount: 1000, whtRate: 3, whtAmount: 30, status: 'active', createdAt: '' },
    { id: 'b', tenantId: WS, vendorId: wv1, formType: 'pnd3', issueDate: '2026-09-05', amount: 2000, whtRate: 3, whtAmount: 60, status: 'done', createdAt: '' },
    { id: 'c', tenantId: WS, vendorId: wv2, formType: 'pnd53', issueDate: '2026-09-09', amount: 5000, whtRate: 3, whtAmount: 150, status: 'active', createdAt: '' },
  ] as never)
  eq(mockWht.count, sep.count, 'WHT parity: count')
  eq(mockWht.amount, sep.amount, 'WHT parity: base amount')
  eq(mockWht.whtAmount, sep.whtAmount, 'WHT parity: tax withheld')
  eq(mockWht.filedCount, sep.filedCount, 'WHT parity: filed count')
  eq(mockWht.vendors, sep.vendors, 'WHT parity: vendors')
  eq(
    mockWht.byForm.map((f) => [f.formType, f.count, f.amount, f.whtAmount]),
    sep.byForm.map((f) => [f.formType, f.count, f.amount, f.whtAmount]),
    'WHT parity: per-form breakdown',
  )

  // Tenant scope must hold: another workspace's certificate stays invisible.
  await client.query(`insert into wht_vendors (id, user_id, name, tax_id, address, vendor_type) values ($1,'ZZZ','อื่น','1','x','company')`, [uuid(502)])
  await client.query(
    `insert into wht_records (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, status, certificate_no)
     values ('ZZZ',$1,'pnd3','2026-09-09',99999,3,300,'active','26099999')`,
    [uuid(502)],
  )
  const wq = whtWhereClause(parseWhtListQuery(new URLSearchParams('month=2026-09')), WS)
  const seenRes = (await client!.query(
    `select count(*)::int as count from wht_records r join wht_vendors v on v.id = r.vendor_id where ${wq.text}`,
    wq.params as never[],
  )) as unknown as { rows: { count: number }[] }
  Number(seenRes.rows[0].count) === 3
    ? ok("WHT: another workspace's certificate is not counted")
    : fail(`WHT leak: ${seenRes.rows[0].count}`)

  // ── Vendor money aggregate ──────────────────────────────────────────────
  // The register showed no money at all. `outstanding` must exclude the same
  // statuses the transaction list excludes, or one number means two things.
  await client.query(`update vendor_payables set status = 'cancelled' where id = $1`, [tid(3)])
  await client.query(`update vendor_payables set status = 'void' where id = $1`, [tid(4)])
  const moneyRes = (await client!.query(
    `select coalesce(t.outstanding, 0)::numeric as outstanding,
            coalesce(t.txn_count, 0)::int as txn_count,
            to_char(t.last_activity, 'YYYY-MM-DD') as last_activity
     from vendor_payees v
     left join lateral (
       select sum(p.net_amount) as outstanding, count(*) as txn_count, max(p.transfer_date) as last_activity
       from vendor_payables p
       where p.user_id = v.user_id and p.vendor_id = v.id and p.status not in ('cancelled', 'void')
     ) t on true
     where v.user_id = $1 and v.id = $2`,
    [WS, V1],
  )) as unknown as { rows: { outstanding: string; txn_count: number; last_activity: string }[] }
  const m0 = moneyRes.rows[0]
  const payableRes = (await client!.query(
    `select count(*)::int as n, coalesce(sum(net_amount),0)::numeric as amt, to_char(max(transfer_date),'YYYY-MM-DD') as last
     from vendor_payables where user_id = $1 and vendor_id = $2 and status not in ('cancelled','void')`,
    [WS, V1],
  )) as unknown as { rows: { n: number; amt: string; last: string }[] }
  eq(Number(m0.txn_count), Number(payableRes.rows[0].n), 'vendor: transaction count')
  eq(Number(m0.outstanding), Number(payableRes.rows[0].amt), 'vendor: outstanding balance excludes cancelled/void')
  eq(String(m0.last_activity), String(payableRes.rows[0].last), 'vendor: last activity date')
  Number(m0.txn_count) > 0 ? ok('vendor: register carries money context') : fail('vendor aggregate is empty')

  // ── Mock/server parity: the JS reference must agree with the SQL ───────
  const raw = await client.query(
    `select p.id, p.user_id, p.ref, p.vendor_id, p.payment_type, p.description, p.note, p.line_items,
      p.gross_amount, p.wht_rate, p.wht_amount, p.net_amount, to_char(p.transfer_date,'YYYY-MM-DD') as transfer_date,
      p.slip_reference, p.slip_file_path, p.status, p.created_at, v.name as vendor_name, v.address as vendor_address,
      (select min(vr.created_at) from vendor_requests vr where vr.transaction_id = p.id) as sent_at,
      (select min(vr.opened_at) from vendor_requests vr where vr.transaction_id = p.id) as opened_at,
      (select max(vr.expires_at) from vendor_requests vr where vr.transaction_id = p.id) as expires_at
     from vendor_payables p join vendor_payees v on v.id = p.vendor_id where p.user_id = $1`,
    [WS],
  )
  const iso = (v: unknown) => (v === null || v === undefined ? undefined : new Date(String(v)).toISOString())
  const asTxns = raw.rows.map((r: Record<string, unknown>): PaymentTransaction => ({
    id: String(r.id),
    tenantId: WS,
    vendor: { id: V1, name: String(r.vendor_name), address: String(r.vendor_address), maskedId: 'x' },
    paymentType: String(r.payment_type),
    description: String(r.description),
    note: String(r.note ?? ''),
    lineItems: [],
    grossAmount: Number(r.gross_amount),
    whtRate: Number(r.wht_rate),
    whtMode: 'deduct',
    whtAmount: Number(r.wht_amount),
    netAmount: Number(r.net_amount),
    transferDate: String(r.transfer_date),
    slipReference: String(r.slip_reference),
    slipName: '',
    status: r.status as PaymentTransaction['status'],
    createdAt: new Date(String(r.created_at)).toISOString(),
    // The mock path carries the invite lifecycle explicitly, exactly as the
    // list endpoint does — without it the attention predicate cannot be
    // reproduced on this side and parity would be vacuous.
    sentAt: iso(r.sent_at),
    openedAt: iso(r.opened_at),
    expiresAt: iso(r.expires_at),
    timeline: [],
    checks: [],
  }))

  for (const params of [
    'month=2026-09&sort=date-desc',
    'month=2026-09&status=active',
    'month=2026-09&slip=with',
    'month=2026-09&min=3000&max=6000',
    'month=2026-09&sort=net-asc',
    'month=2026-09&attention=1',
    'month=2026-08&sort=date-asc',
  ]) {
    const q = parseListQuery(new URLSearchParams(params))
    // Translate the wire query back into filter state for the mock executor.
    const f = {
      ...emptyFilters(),
      search: q.q,
      status: q.status,
      month: q.month,
      from: q.from,
      to: q.to,
      paymentType: q.paymentType,
      slip: q.slip,
      minNet: q.min,
      maxNet: q.max,
      vendorId: q.vendorId,
      attention: q.attention,
      sort: q.sort,
    }
    const mockRows = filterTransactions(asTxns, f)
    const mockIds = sortTransactions(mockRows, q.sort).map((t) => label(t.id))
    const sql = await list(params)
    eq(sql.ids, mockIds, `parity: ${params}`)
    eq(sql.totals.payableNet, summarize(mockRows).payableNet, `parity totals: ${params}`)
  }
} catch (e) {
  fail(`exception: ${(e as Error).message}`)
} finally {
  try {
    await client?.end()
  } catch {
    /* ignore */
  }
  try {
    await pgServer.stop()
  } catch {
    /* ignore */
  }
}

console.log(failures ? `\ndb:list FAILED (${failures})` : '\ndb:list OK')
process.exit(failures ? 1 : 0)
