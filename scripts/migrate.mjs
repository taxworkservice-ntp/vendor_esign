// Applies db/migrations/*.up.sql in order. Never prints secrets.
// Usage: npm run db:migrate   (needs DATABASE_URL in .env.local — see docs/DB.md)
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenv } from 'dotenv'
import { neon } from '@neondatabase/serverless'

dotenv({ path: '.env.local' })
dotenv()

const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
if (!url) {
  console.error('Missing DATABASE_URL. Copy the pooled string into .env.local (see docs/DB.md). Nothing was applied.')
  process.exit(1)
}

// Split on statement boundaries while respecting $$ dollar-quoted function bodies.
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const files = readdirSync(root).filter((f) => f.endsWith('.up.sql')).sort()
const sql = neon(url)

for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8')
  const stmts = splitStatements(text)
  console.log(`${f}: ${stmts.length} statements`)
  for (const s of stmts) await sql.query(s)
}
console.log('migrate: OK')
