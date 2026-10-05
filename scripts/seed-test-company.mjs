// Creates a test client workspace + login and seeds 10 suppliers + 10 catalogue
// items, with full vendor details (tax id encrypted the same way the server
// does). Safe to rerun: the workspace/user are upserted, the vendors/items are
// only inserted when missing (matched by name), so existing data is untouched.
//
// Usage:
//   COMPANY_EMAIL=testcompany@gmail.com COMPANY_CODE=TESTCO npm run seed:test-company
// Needs DATABASE_URL and ID_ENCRYPTION_KEY (the same key the server uses, so the
// encrypted tax ids decrypt on the client portal).
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { createCipheriv, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

dotenv({ path: '.env.local' })
dotenv()

const scryptAsync = promisify(scrypt)
const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const keyB64 = process.env.ID_ENCRYPTION_KEY ?? ''
if (!url) {
  console.error('Missing DATABASE_URL. Nothing was created.')
  process.exit(1)
}
if (!keyB64 || Buffer.from(keyB64, 'base64').length !== 32) {
  console.error('Missing/invalid ID_ENCRYPTION_KEY (32-byte base64). Vendor tax ids would not decrypt.')
  process.exit(1)
}

const EMAIL = (process.env.COMPANY_EMAIL ?? 'testcompany@gmail.com').trim().toLowerCase()
const CODE = (process.env.COMPANY_CODE ?? 'TESTCO').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
const NAME = process.env.COMPANY_NAME ?? 'บริษัท เทสต์คอมพานี จำกัด (Test Company)'
const ADDRESS = process.env.COMPANY_ADDRESS ?? '199/9 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110'
const TAX_ID = process.env.COMPANY_TAX_ID ?? '0105566999999'
const CONTACT = process.env.COMPANY_CONTACT ?? 'คุณทดสอบ'
const PASSWORD = process.env.COMPANY_PASSWORD ?? 'Testcompany123'
const BE_YEAR = 2569

// ── Encrypt a tax id exactly like server/src/crypto.ts (AES-256-GCM) ──
const KEY = Buffer.from(keyB64, 'base64')
function encryptId(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

async function hashPassword(pw) {
  const salt = randomBytes(16)
  const key = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 })
  return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`
}

// Individual vendors need a personal title; entities (บริษัท/ร้าน/…) do not.
const VENDORS = [
  ['นาย', 'สมชาย ใจดี', '12/3 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', '1101700230701', '081-234-5601', 'somchai.j@example.com', false],
  ['นาง', 'สุดา แสงทอง', '88/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', '1101700230702', '081-234-5602', 'suda.s@example.com', false],
  ['นาย', 'วิชัย รุ่งเรือง', '45 ซ.ร่วมใจ ต.บ้านเป็ด อ.เมือง จ.ขอนแก่น 40002', '1101700230703', '081-234-5603', 'wichai.r@example.com', false],
  ['นางสาว', 'ปิยะดา ศรีสุข', '101/2 ถ.ศรีจันทร์ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', '1101700230704', '081-234-5604', 'piyada.s@example.com', false],
  ['', 'บริษัท สยามซัพพลาย จำกัด', '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110', '0105566000011', '02-123-4505', 'contact@siamsupply.co.th', true],
  ['', 'ร้าน เจริญพานิช', '22 ม.2 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540', '1103700230706', '02-123-4506', 'charoen@example.com', true],
  ['นาย', 'อนันต์ ช่างยนต์', '9 ถ.กลางเมือง ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', '1101700230707', '081-234-5607', 'anan.c@example.com', false],
  ['นางสาว', 'กมลรัตน์ การบัญชี', '77 ม.11 ต.ศิลา อ.เมือง จ.ขอนแก่น 40000', '1101700230709', '081-234-5608', 'kamolrat.a@example.com', false],
  ['', 'บริษัท เทคโน เซอร์วิส จำกัด', '55/8 ถ.รัตนาธิเบศร์ ต.บางกระสอ อ.เมือง จ.นนทบุรี 11000', '0105566000022', '02-123-4509', 'info@techno.co.th', true],
  ['นาย', 'ประสิทธิ์ ขนส่ง', '24/6 ถ.รื่นรมย์ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', '1101700230710', '081-234-5610', 'prasit.k@example.com', false],
]

const ITEMS = [
  ['ค่าจ้างทำความสะอาดสำนักงาน', 'งาน', 3000],
  ['ค่าซ่อมแอร์ (ต่อเครื่อง)', 'เครื่อง', 2500],
  ['ค่าอะไหล่แอร์ R32', 'ชุด', 3500],
  ['ค่าเช่าที่จอดรถรายเดือน', 'เดือน', 5000],
  ['ค่าจัดส่ง (ต่อเที่ยว)', 'เที่ยว', 1500],
  ['ค่าจ้างช่าง (ต่อชั่วโมง)', 'ชั่วโมง', 350],
  ['ค่าบริการบำรุงรักษารายเดือน', 'เดือน', 2000],
  ['ค่าวัสดุสิ้นเปลือง', 'ชุด', 800],
  ['ค่าที่ปรึกษาภาษี', 'ชั่วโมง', 1800],
  ['ค่าออกแบบและพิมพ์สื่อสิ่งพิมพ์', 'งาน', 6500],
]

const sql = neon(url)

// 1) Workspace
await sql`insert into client_profiles (id, name, client_code, display_name, address, tax_id, contact_name, status, be_year, start_number)
  values (${CODE}, ${NAME}, ${CODE}, ${NAME}, ${ADDRESS}, ${TAX_ID}, ${CONTACT}, 'active', ${BE_YEAR}, 1)
  on conflict (id) do update set name = excluded.name, display_name = excluded.display_name,
    address = excluded.address, tax_id = excluded.tax_id, contact_name = excluded.contact_name,
    status = 'active', updated_at = now()`

// 2) Per-tenant defaults
await sql`insert into config (user_id, key, value) values
  (${CODE}, 'wht_rates', '[{"paymentType":"ค่าจ้างทำของ","rate":3,"label":"ค่าจ้างทำของ"},{"paymentType":"ค่าวิชาชีพอิสระ","rate":3,"label":"ค่าวิชาชีพอิสระ"},{"paymentType":"ค่าบริการ","rate":3,"label":"ค่าบริการ"},{"paymentType":"ค่าเช่าทรัพย์สิน","rate":5,"label":"ค่าเช่าทรัพย์สิน"},{"paymentType":"ค่านายหน้า","rate":3,"label":"ค่านายหน้า"},{"paymentType":"ค่าขนส่ง","rate":1,"label":"ค่าขนส่ง"},{"paymentType":"ไม่หักภาษี ณ ที่จ่าย","rate":0,"label":"ไม่หักภาษี ณ ที่จ่าย"}]'),
  (${CODE}, 'wht_min_threshold', '1000'),
  (${CODE}, 'link_expiry_days', '7'),
  (${CODE}, 'consent_text_v1', '{"th": "ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าเฉพาะธุรกรรมนี้เท่านั้น"}')
  on conflict (user_id, key) do nothing`

await sql`insert into doc_number_sequences (user_id, doc_type, be_year, vendor_no, last_number)
  values (${CODE}, 'vendor_receipt', ${BE_YEAR}, 0, 0)
  on conflict (user_id, doc_type, be_year, vendor_no) do nothing`

// 3) Client login (owner). Known password, no forced change (test account).
const hash = await hashPassword(PASSWORD)
const existing = await sql`select id from profiles where lower(email) = ${EMAIL}`
let userId = existing[0]?.id
if (!userId) {
  const ins = await sql`insert into profiles (email, status, role, is_platform_admin, password_hash, must_change_pw)
    values (${EMAIL}, 'active', 'owner', false, ${hash}, false) returning id`
  userId = ins[0].id
} else {
  await sql`update profiles set status = 'active', role = 'owner', is_platform_admin = false,
    password_hash = ${hash}, must_change_pw = false, temp_expires_at = null, updated_at = now() where id = ${userId}`
}
await sql`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
  values (${userId}, ${hash}, false, null)
  on conflict (user_id) do update set password_hash = excluded.password_hash,
    must_change_pw = false, temp_expires_at = null, updated_at = now()`
await sql`insert into client_members (member_user_id, workspace_user_id, role, status, password_changed, permissions)
  values (${userId}, ${CODE}, 'owner', 'active', true, '{}'::jsonb)
  on conflict (member_user_id, workspace_user_id) do update set role = 'owner', status = 'active', password_changed = true`
await sql`delete from sessions where user_id = ${userId}`

// 4) Suppliers (10) — insert only when the (workspace, name) is missing.
let vNo = Number((await sql`select coalesce(max(vendor_no), 0) as n from vendor_payees where user_id = ${CODE}`)[0]?.n ?? 0)
let vendorsAdded = 0
for (const [prefix, name, address, taxId, phone, email, vat] of VENDORS) {
  const found = await sql`select 1 from vendor_payees where user_id = ${CODE} and name = ${name} limit 1`
  if (found.length) continue
  vNo += 1
  await sql`insert into vendor_payees (user_id, vendor_no, prefix, name, address, id_number_encrypted, phone, email, is_vat_registered)
    values (${CODE}, ${vNo}, ${prefix}, ${name}, ${address}, ${encryptId(taxId)}, ${phone}, ${email}, ${vat})`
  vendorsAdded += 1
}

// 5) Catalogue items (10).
let iNo = Number((await sql`select coalesce(max(item_no), 0) as n from items where user_id = ${CODE}`)[0]?.n ?? 0)
let itemsAdded = 0
for (const [name, unit, price] of ITEMS) {
  const found = await sql`select 1 from items where user_id = ${CODE} and lower(name) = lower(${name}) limit 1`
  if (found.length) continue
  iNo += 1
  await sql`insert into items (user_id, item_no, name, unit, unit_price) values (${CODE}, ${iNo}, ${name}, ${unit}, ${price})`
  itemsAdded += 1
}

const vTotal = Number((await sql`select count(*)::int as n from vendor_payees where user_id = ${CODE}`)[0]?.n ?? 0)
const iTotal = Number((await sql`select count(*)::int as n from items where user_id = ${CODE}`)[0]?.n ?? 0)

console.log(`seed-test-company: OK workspace=${CODE} user=${EMAIL}`)
console.log(`  password: ${PASSWORD}`)
console.log(`  vendors: ${vTotal} (added ${vendorsAdded}) · items: ${iTotal} (added ${itemsAdded})`)
