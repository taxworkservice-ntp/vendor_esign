// One filename convention for every exported artifact (CSV, PDF, ZIP).
//
// Two shapes, on purpose:
//
//  1. `downloadName` — batch/register exports (a date-stamped list file).
//  2. `documentFileName` — a single statutory document: the document number,
//     then the vendor (title stripped, ≤10 chars, spaces kept), then the
//     gross amount before WHT. `RCT-001-2569-001-สมชาย การช่าง_5000.00.pdf`.
//
// A file that lands in an accountant's folder should say what it is without
// opening it, and the name must survive being written to disk.

/** Sanitize a segment so it is safe on every filesystem. Drops path chars. */
function seg(s: string): string {
  return s
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/** Local timestamp suffix `YYYYMMDD-HHMM`, so repeated exports never collide. */
export function stamp(when: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}`
}

// A textual period that says no more than the kind already does is dropped so
// the name never reads "wht-certificates-...-wht". Only extra segments are
// tested — the primary kind is always kept verbatim.
const REDUNDANT = /^(transactions?|wht|wht-?certificates?|vendors?|items?|export|all)$/i

export interface NameParts {
  /** Document family, e.g. "wht-certificates", "transactions", "vendors". */
  kind: string
  /** Workspace/client code (ABC). Omitted when unknown. */
  clientCode?: string
  /** Period the file covers, e.g. "2026-10" or "2026-10-01..2026-10-31". */
  period?: string
  /** Extra qualifier, e.g. a form type or record count. */
  qualifier?: string
  /** File extension without the dot. */
  ext: string
  /** Timestamp; pass `null` to omit it (fixed artifacts like a named PDF). */
  when?: Date | null
}

/**
 * Build `{kind}-{clientCode}-{period}[-{qualifier}]-{stamp}.{ext}`, dropping
 * any empty segment. Fixed artifacts (a signed PDF) pass `when: null` so the
 * name is stable and matches the document it contains.
 */
export function downloadName(parts: NameParts): string {
  const bits = [
    parts.kind,
    parts.clientCode,
    parts.period && !REDUNDANT.test(parts.period) ? parts.period : '',
    parts.qualifier,
  ]
    .filter((b): b is string => !!b && !!seg(b))
    .map(seg)
  if (parts.when !== null) bits.push(stamp(parts.when ?? new Date()))
  return `${bits.join('-')}.${parts.ext}`
}

// ── Single statutory documents (receipt, WHT certificate) ────────────────────

/** Personal titles (คำนำหน้าชื่อ) that add nothing to a filename. */
const TITLES = ['นางสาว', 'นาง', 'นาย']

/**
 * Vendor name for a filename: drop a leading personal title, collapse internal
 * whitespace to single spaces, then trim to `max` characters at a word boundary
 * (a single over-long token is hard-cut). Spaces are kept — not replaced with
 * dashes — because it stays readable and `documentFileName` joins with `-`.
 *
 * `นาย สมชาย การช่าง` → `สมชาย การช่าง` → (`max` 10) `สมชาย การ`.
 */
export function trimVendor(name: string | undefined, max = 10): string {
  let s = (name ?? '').trim().replace(/\s+/g, ' ')
  for (const t of TITLES) {
    if (s.startsWith(t)) {
      s = s.slice(t.length).trimStart()
      break
    }
  }
  if (s.length <= max) return s
  // Keep whole words while they fit; if a further word does not fit whole,
  // include as much of it as remains — better "สมชาย การ" than "สมชาย".
  const words = s.split(' ')
  const kept: string[] = []
  for (const w of words) {
    const next = [...kept, w].join(' ')
    if (next.length > max) {
      const room = max - (kept.join(' ').length + (kept.length ? 1 : 0))
      if (room > 0) kept.push(w.slice(0, room))
      break
    }
    kept.push(w)
  }
  return kept.join(' ')
}

/** Two decimals, no grouping — ASCII-safe for filenames. */
function money(amount: number): string {
  return amount.toFixed(2)
}

export interface DocumentNameParts {
  /** Document number, already formatted (e.g. "RCT-001-2569-001", "26091001"). */
  number: string
  /** Vendor name — WITHOUT a personal title (or the title is stripped here). */
  vendorName?: string
  /** Gross base amount, before WHT. */
  amount?: number
  /** File extension without the dot. Defaults to `pdf`. */
  ext?: string
}

/**
 * Build `{number}[-{vendor}][_{amount}].{ext}` for a single document.
 * `RCT-001-2569-001-สมชาย การช่าง_5000.00.pdf`, or `26091001_5000.00.pdf`
 * when there is no vendor name.
 */
export function documentFileName(parts: DocumentNameParts): string {
  const number = String(parts.number ?? '').trim()
  const vendor = trimVendor(parts.vendorName)
  const amount = parts.amount != null && Number.isFinite(parts.amount) ? money(parts.amount) : ''
  const stem = [number, vendor ? `-${vendor}` : '', amount ? `_${amount}` : ''].join('')
  // Sanitize the assembled stem so a stray "/" in a number or vendor cannot
  // become a path separator, while keeping spaces between vendor words.
  const safe = seg(stem) || 'document'
  return `${safe}.${parts.ext ?? 'pdf'}`
}

/**
 * RFC 6266/5987 `Content-Disposition` value. Non-ASCII (Thai) in a bare
 * `filename=` is unreliable across browsers, so the full name travels in
 * `filename*` (percent-encoded UTF-8) and an ASCII-only `filename=` is the
 * fallback. Same header shape everywhere a binary is served.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7E]/g, '') // drop non-ASCII (Thai)
    .replace(/["\\]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\s*([-_])\s*/g, '$1') // no space hugging a separator
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    || 'document'
  const encoded = encodeURIComponent(filename).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
