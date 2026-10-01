// React correctness scan — `node scripts/check-react.mjs` (fails on violation).
//
// Two defects reached production through this codebase and neither tsc nor the
// 321 unit tests could see them, because both only surface in a browser at
// runtime:
//
//  1. RULES OF HOOKS. A hook called after a conditional `return` makes render N
//     call fewer hooks than render N+1, and React throws "Rendered more hooks
//     than during the previous render". TransactionDetail and ReceiptView both
//     had one, so the two pages a bookkeeper opens to check a signature and read
//     a receipt were crashing into the error boundary. Nothing in `npm run lint`
//     looked for this: there is no eslint-plugin-react-hooks in the project and
//     `tsc` is structurally incapable of flagging it.
//
//  2. INVALID TABLE MARKUP. `TableSkeleton` emitted <tr> and was rendered inside
//     <Card><CardBody> (a <div>) on the detail pages, producing
//     validateDOMNesting warnings while the browser silently hoisted the rows out
//     of the card.
//
// Both are single-file, whole-function properties, so a scope-tracking scan is
// enough to catch them and there is no reason to add an eslint dependency. This
// is a deliberate approximation — it tracks scopes by brace counting rather than
// with a real parser, so it is a backstop, not a replacement for eslint.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(f))
  .filter((f) => !f.endsWith('pages/WhtPrint.tsx')) // pixel-locked external template

const HOOK = /\buse[A-Z]\w*\s*\(/
// Opens a new function scope: a declaration, or an arrow with a block body.
// Returns inside these do not belong to the component and must not count.
const FN_OPEN =
  /^(export\s+)?(default\s+)?function\s*\w*\s*\(|=>\s*\{/
const problems = []

function scanHooks(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)

  // One frame per open brace, flagged when it is a function boundary. Control
  // flow inside `if (...) { return ... }` is still the component's own flow, so
  // a plain block frame must not hide a return — only a nested *function* frame
  // does. Hence fnDepth rather than brace depth.
  const fnStack = []
  let fnDepth = 0
  let componentId = 0
  let returnedAt = null
  let componentIdAtReturn = null

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim()
    const isComment = text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')

    if (fnDepth === 1 && !isComment) {
      if (/^return\b/.test(text) && returnedAt === null) {
        returnedAt = i + 1
        componentIdAtReturn = componentId
      }
      if (returnedAt !== null && componentIdAtReturn === componentId && HOOK.test(text)) {
        problems.push(
          `${file}:${i + 1}  ${HOOK.exec(text)?.[0].trim()} is called after the conditional return at line ${returnedAt}\n` +
            `    ${text.slice(0, 92)}`,
        )
      }
    }

    for (const ch of lines[i]) {
      if (ch === '{') {
        if (FN_OPEN.test(text)) {
          fnStack.push(true)
          fnDepth++
          if (fnDepth === 1) componentId++
        } else {
          fnStack.push(false)
        }
      } else if (ch === '}') {
        if (fnStack.pop()) fnDepth--
      }
    }
  }
}

function scanTableMarkup(file) {
  // <tr>/<td> are only valid inside a table. Checked separately from the hook
  // scan: the two defects share a root cause (a shared component dropped into the
  // wrong container) but nothing else about them is related.
  // Note: the guard is on the *call site*, not on whether this file happens to
  // contain a <tr>. A page that renders TableSkeleton inside a card usually has
  // no table of its own — which is exactly the case that needs reporting.
  const all = readFileSync(file, 'utf8').split(/\r?\n/)
  all.forEach((line, i) => {
    if (!/<TableSkeleton\b/.test(line)) return
    const before = all.slice(Math.max(0, i - 30), i).join('\n')
    const openTbody = before.lastIndexOf('<tbody')
    const closeTbody = before.lastIndexOf('</tbody')
    if (openTbody === -1 || openTbody < closeTbody) {
      problems.push(
        `${file}:${i + 1}  <TableSkeleton> renders <tr>/<td> but is not inside a <tbody>\n` +
          `    ${line.trim().slice(0, 92)}\n    use <PanelSkeleton> in a non-table container`,
      )
    }
  })
}

for (const f of files) {
  scanHooks(f)
  scanTableMarkup(f)
}

if (problems.length) {
  console.error(`check:react — ${problems.length} violation(s):\n`)
  for (const p of problems) console.error(`  ${p}\n`)
  process.exit(1)
}

console.log(
  `check:react OK — ${files.length} files: no hook after a conditional return, no <tr> outside <tbody>`,
)