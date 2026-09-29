// Design-system scan — `npm run lint:design` (warn by default, `--strict` fails).
// Guides the incremental migration to the shared tokens (src/design/tokens.ts):
// flag arbitrary px type sizes, retired neutrals, font-bold and raw hex colours.
// Legacy code still builds — this reports a migration backlog, it does not gate.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const strict = process.argv.includes('--strict')
const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.includes('components/print/')) // print layer is exempt

const RULES = [
  { name: 'arbitrary text size', re: /text-\[[0-9.]+px\]/g },
  { name: 'retired neutral (slate/gray/stone)', re: /\b(?:bg|text|border|ring|divide)-(?:slate|gray|stone|cool)-[0-9]{2,3}\b/g },
  { name: 'font-bold', re: /\bfont-bold\b/g },
  { name: 'raw hex colour', re: /#[0-9a-fA-F]{6}\b/g },
]

let total = 0
const hits = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let count = 0
  for (const rule of RULES) {
    const m = src.match(rule.re)
    if (m) count += m.length
  }
  if (count) {
    hits.push(`${String(count).padStart(4)}  ${file}`)
    total += count
  }
}

hits.sort().reverse()
for (const h of hits.slice(0, 30)) console.log(h)
console.log(`\nlint:design — ${total} legacy-token occurrences across ${hits.length} files (migration backlog)`)
console.log(`Rule of thumb: components consume roles (text-body / bg-page-bg / rounded-card), not raw px/hex.`)
process.exit(strict && total > 0 ? 1 : 0)
