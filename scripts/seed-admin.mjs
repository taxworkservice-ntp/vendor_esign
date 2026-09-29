// Seeds the first super_admin for the isolated admin operation (004).
// Usage: ADMIN_EMAIL=you@taxwork.local npm run db:seed-admin
// Prints a one-time temp password — hand it over off-band, never commit it.
// Needs DATABASE_URL in .env.local (see docs/DB.md).
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes, scrypt } from 'node:crypto'
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
  const ins = await sql`insert into profiles (email, status, role) values (${email}, 'active', 'owner') returning id`
  userId = ins[0].id
  await sql`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
    values (${userId}, ${hash}, true, ${tempExpires})`
} else {
  await sql`insert into auth_credentials (user_id, password_hash, must_change_pw, temp_expires_at)
    values (${userId}, ${hash}, true, ${tempExpires})
    on conflict (user_id) do update set password_hash = excluded.password_hash,
      must_change_pw = true, temp_expires_at = excluded.temp_expires_at, updated_at = now()`
  await sql`update profiles set status = 'active', updated_at = now() where id = ${userId}`
}
// Workspace membership: owner of the pilot workspace (008 alignment).
await sql`insert into client_members (member_user_id, workspace_user_id, role)
  values (${userId}, 'ABC', 'owner')
  on conflict (member_user_id, workspace_user_id) do update set role = 'owner'`

const tokenHash = createHash('sha256').update(email).digest('hex').slice(0, 12)
console.log(`seed-admin: OK user=${email} id=${userId} ref=${tokenHash}`)
console.log(`TEMP PASSWORD (show once, expires in 7 days): ${pw}`)
