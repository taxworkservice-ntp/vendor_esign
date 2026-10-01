// Global accounting-period (month) utilities. Pure functions so they are
// unit-testable and shared by the client hook, the mock/server filters, and
// the API validators without importing React or localStorage at module load.
//
// Semantics (agreed):
// - Transactions + Metrics filter on transferDate.
// - WHT filters on issueDate.
// - '' means "all time" (no month constraint).
// - Month strings are YYYY-MM calendar months (Asia/Bangkok wall calendar).
//   All comparisons slice the ISO date part, never `new Date()` arithmetic on
//   the boundary, so there is no UTC/Bangkok midnight shift.

import { currentMonth } from './txn-filters'

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isValidMonth(s: string | null | undefined): s is string {
  return typeof s === 'string' && MONTH_RE.test(s)
}

const PREFIX = 'tw:global-month:'

export function monthStorageKey(tenantId: string): string {
  return `${PREFIX}${tenantId || 'ABC'}`
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function readStoredMonth(tenantId: string): string | null {
  const ls = storage()
  if (!ls) return null
  try {
    const raw = ls.getItem(monthStorageKey(tenantId))
    // '' (all time) is a deliberate pick and is preserved; anything else
    // must be a valid YYYY-MM or it is treated as absent (corrupt).
    if (raw === '') return ''
    return isValidMonth(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredMonth(tenantId: string, month: string): void {
  const ls = storage()
  if (!ls) return
  try {
    if (month === '' || isValidMonth(month)) ls.setItem(monthStorageKey(tenantId), month)
  } catch {
    /* quota / private mode — persistence is best-effort */
  }
}

// Init priority: explicit ?month= URL override > stored last pick > current
// month. An invalid URL value is ignored (never persisted, never applied).
export function resolveMonth(opts: {
  urlMonth?: string | null
  tenantId: string
  today?: Date
}): string {
  const { urlMonth, tenantId, today } = opts
  if (isValidMonth(urlMonth)) return urlMonth as string
  const stored = readStoredMonth(tenantId)
  if (stored !== null) return stored
  return currentMonth(today ?? new Date())
}

// Inclusive [from, to] date range (YYYY-MM-DD) for a month. Pure calendar
// arithmetic — no Date object, so no timezone shift on month boundaries.
export function monthRange(month: string): { from: string; to: string } {
  const m = MONTH_RE.exec(month)
  if (!m) throw new Error('invalid-month')
  const y = Number(m[1])
  const mo = Number(m[2])
  const nextY = mo === 12 ? y + 1 : y
  const nextM = mo === 12 ? 1 : mo + 1
  const lastDay = new Date(Date.UTC(nextY, nextM - 1, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${lastDay}` }
}

const TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// Display label, e.g. "ก.ย. 2569" (Buddhist year, Thai convention).
export function formatMonthTH(month: string): string {
  const m = MONTH_RE.exec(month)
  if (!m) return month
  return `${TH_SHORT[Number(m[2]) - 1]} ${Number(m[1]) + 543}`
}

// Shift a YYYY-MM month by `delta` months (negative = back). Pure calendar
// arithmetic across year boundaries: 2026-01 − 1 → 2025-12.
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month)
  if (!m) throw new Error('invalid-month')
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta
  const y = Math.floor(total / 12)
  const mo = (total % 12) + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${pad(mo)}`
}

// Dropdown presets: this month + the previous `count - 1` months, newest
// first. Fixed calendar list — never depends on which months have data.
export function recentMonths(count = 12, today: Date = new Date()): string[] {
  const base = currentMonth(today)
  return Array.from({ length: count }, (_, i) => shiftMonth(base, -i))
}
