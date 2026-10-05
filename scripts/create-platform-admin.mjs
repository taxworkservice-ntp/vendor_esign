// Creates (or resets) a provider/operator account: profiles.is_platform_admin.
// The operator controls the whole app and is a member of NO client workspace.
//
// Usage:
//   ADMIN_EMAIL=you@taxwork.local npm run admin:create
// Prints a one-time temp password (forced change on first login). Needs
// DATABASE_URL (see docs/DB.md). Never log or commit the password.
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

dotenv({ path: '.env.local' })
dotenv()

const scryptAsync = promisify(scrypt)
const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
if (!url) {
  console.error('Missing DATABASE_URL. Nothing was created.')
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Set ADMIN_EMAIL=you@domain first. Nothing was created.')
  process.exit(1)
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const pw = Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join('')
const salt = randomBytes(16)
const key = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 })
const hash = `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`
const tempExpires = new Date(Date.now() + 7 * 86400 * 1000).toISOString()

const sql = neon(url)
const existing = await sql`select id from profiles where lower(email) = ${email}`
let userId = existing[0]?.id

if (!userId) {
  // profiles.password_hash is NOT NULL (008 split credentials out but kept the
  // legacy column). Keep both in sync.
  const ins = await sql`insert into profiles (email, status, role, is_platform_admin, password_hash, must_change_pw, temp_expires_at)
    values (${email}, 'active', 'super_admin', true, ${hash}, true, ${tempExpires}) returning id`
  userId = ins[0].id
} else {
  await sql`update profiles set status = 'active', role = 'super_admin', is_platform_admin = true,
    password_hash = ${hash}, must_change_pw = true, temp_expires_at = ${tempExpires}, updated_at = now()
    where id = ${userId}`
}

await sql`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
  values (${userId}, ${hash}, true, ${tempExpires})
  on conflict (user_id) do update set password_hash = excluded.password_hash,
    must_change_pw = true, temp_expires_at = excluded.temp_expires_at, updated_at = now()`

// Drop any client memberships — the operator is not a tenant user.
await sql`delete from client_members where member_user_id = ${userId}`
await sql`delete from sessions where user_id = ${userId}`

console.log(`create-platform-admin: OK email=${email} id=${userId}`)
console.log(`TEMP PASSWORD (show once, expires in 7 days): ${pw}`)
