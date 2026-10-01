import { WHT_FORM_LABELS, WHT_FORM_TYPES, type WhtFormType } from './wht'
import { asWhtSort, type WhtSortKey, type WhtStatusFilter } from './wht-summary'
import { isValidMonth as isValidMonthParam } from './global-month'

// The one descriptor for "which WHT certificates, in what order, which slice" —
// the same pattern as src/lib/txn-list-query.ts, for the same reason: the mock
// and the server must not disagree about what a request means.
//
// Pure module, so the server can import it directly.

export const DEFAULT_WHT_PAGE_SIZE = 50
export const MAX_WHT_PAGE_SIZE = 200
/** `limit: 0` returns every matching row — used by the print view. */
export const WHT_EXPORT_LIMIT = 0
export const WHT_PAGE_SIZES = [25, 50, 100, 200] as const

export interface WhtListQuery {
  /** YYYY-MM, scoped on issue_date (the certificate period). */
  month: string
  q: string
  /** '' = every form. */
  formType: WhtFormType | ''
  status: WhtStatusFilter
  sort: WhtSortKey
  limit: number
  offset: number
}

function str(v: string | null, max: number): string {
  return (v ?? '').trim().slice(0, max)
}

function asStatus(v: string | null): WhtStatusFilter {
  return v === 'active' || v === 'done' ? v : 'all'
}

function asForm(v: string | null): WhtFormType | '' {
  return v && (WHT_FORM_TYPES as string[]).includes(v) ? (v as WhtFormType) : ''
}

export function parseWhtListQuery(sp: URLSearchParams): WhtListQuery {
  const rawLimit = sp.get('limit')
  const rawOffset = sp.get('offset')
  return {
    month: isValidMonthParam(sp.get('month')) ? (sp.get('month') as string) : '',
    q: str(sp.get('q'), 120),
    formType: asForm(sp.get('formType')),
    status: asStatus(sp.get('status')),
    sort: asWhtSort(sp.get('sort')),
    limit:
      rawLimit === null
        ? DEFAULT_WHT_PAGE_SIZE
        : rawLimit === String(WHT_EXPORT_LIMIT)
          ? WHT_EXPORT_LIMIT
          : bounded(rawLimit, MAX_WHT_PAGE_SIZE, DEFAULT_WHT_PAGE_SIZE),
    offset: rawOffset === null ? 0 : Math.max(0, Math.trunc(Number(rawOffset) || 0)),
  }
}

function bounded(raw: string, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.trunc(n), max)
}

export function whtQueryToParams(q: WhtListQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (q.month) p.set('month', q.month)
  if (q.q) p.set('q', q.q)
  if (q.formType) p.set('formType', q.formType)
  if (q.status !== 'all') p.set('status', q.status)
  if (q.sort !== 'date-desc') p.set('sort', q.sort)
  if (q.limit !== DEFAULT_WHT_PAGE_SIZE) p.set('limit', String(q.limit))
  if (q.offset) p.set('offset', String(q.offset))
  return p
}

export { WHT_FORM_LABELS, WHT_FORM_TYPES }
