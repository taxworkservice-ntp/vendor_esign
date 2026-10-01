// Design-system scan — `npm run lint:design` (warn by default, `--strict` fails).
// Guides the incremental migration to the shared tokens (src/design/tokens.ts):
// flag arbitrary px type sizes, retired neutrals, font-bold and raw hex colours.
// Legacy code still builds — this reports a migration backlog, it does not gate.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const strict = process.argv.includes('--strict')
const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(f)) // skip staged-but-deleted files
  .filter((f) => !f.includes('components/print/')) // print layer is exempt
  .filter((f) => !f.endsWith('pages/WhtPrint.tsx')) // exact external WHT template (pixel-locked)

// Utility prefixes a raw Tailwind palette colour can hide behind. `accent-`
// is included because it was a real gap: `accent-slate-900` sat in
// VendorSign.tsx for months and the old rule never matched it.
const UTIL = 'bg|text|border|ring|divide|accent|fill|from|to|via|outline|decoration|caret'

// The entire raw Tailwind palette. Previously only slate/gray/stone/cool were
// banned, which is how 71 off-system classes accumulated across 15 files:
// bg-emerald-50 and text-emerald-700 sat alongside the `success` tokens for
// the same meaning, and the two were visibly different colours (a cool mint
// against a warm olive). Components consume ROLES — ink-*, primary-*,
// success*, warning*, danger* — never a palette number.
const RAW_PALETTE =
  'slate|gray|stone|zinc|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|cool|warm'

const RULES = [
  { name: 'arbitrary text size', re: /text-\[[0-9.]+px\]/g },
  { name: 'raw Tailwind palette colour', re: new RegExp(`\\b(?:${UTIL})-(?:${RAW_PALETTE})-\\d{2,3}\\b`, 'g') },
  { name: 'font-bold', re: /\bfont-bold\b/g },
  { name: 'raw hex colour', re: /#[0-9a-fA-F]{6}\b/g },
  // Stock Tailwind elevation. `shadow-card` and `shadow-overlay` are the only two
  // shadows tailwind.config.ts defines, and both are tinted with the warm ink
  // ramp; shadow-sm/lg are Tailwind's cool blue-grey, so they read as a different
  // system. Three had survived in TransactionNew.
  { name: 'stock Tailwind shadow', re: /\bshadow-(?:sm|md|lg|xl|2xl|inner|none)\b/g },
]

// `uppercase` on Thai labels is flagged, because it is a no-op on Thai script
// (no case) and therefore only ever shipped paired with letter-spacing, which
// loosens Thai's stacked vowel signs and tone marks. Two files are exempt: the
// receipt sheet's wordmark is genuinely Latin, and the client-code input
// normalises typed input to upper case as a behaviour, not as a style.
const UPPERCASE_EXEMPT = ['src/pages/ReceiptView.tsx', 'src/pages/admin/ClientNew.tsx']

let total = 0
const hits = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let count = 0
  for (const rule of RULES) {
    const m = src.match(rule.re)
    if (m) count += m.length
  }
  if (!UPPERCASE_EXEMPT.some((x) => file.endsWith(x))) {
    const m = src.match(/\buppercase\b/g)
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
console.log(`Rule of thumb: components consume roles (text-body / bg-paper / rounded-card), not raw px/hex.`)
console.log(`Also flagged: stock shadow-*, and \`uppercase\` on Thai text (a no-op on a caseless script).`)
process.exit(strict && total > 0 ? 1 : 0)
