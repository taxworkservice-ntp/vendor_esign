// Applies db/seeds/seed_demo.sql (FAKE data only). Idempotent via ON CONFLICT guards.
// Usage: npm run db:seed
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'seeds', 'seed_demo.sql'), 'utf8')
await sql(text)
console.log('seed: OK (fake demo data)')
