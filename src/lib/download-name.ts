// One filename convention for every exported artifact (CSV, PDF).
//
// Before this, each page hand-built its own name and drifted: the WHT CSV ran
// its own timestamp through `.replace(/^transactions-/, '')` and still carried
// the word "transactions", and the WHT PDF was just `wht_3.pdf`. A file that
// lands in an accountant's folder should say what it is, for which workspace,
// and for which period — without reading the contents.

/** Sanitize a segment so it is safe on every filesystem. */
function seg(s: string): string {
  return s
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
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
