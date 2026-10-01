// Shared ?month= validator for list endpoints. Rejects anything that is not
// a strict YYYY-MM calendar month so a malformed value can never silently
// widen into a full-table scan or shift a tax-period boundary.
// Returns {from,to} inclusive on success, {error} on failure; undefined month
// means "no constraint" (all time).

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function parseMonthParam(
  raw: string | undefined | null,
): { from: string; to: string } | { error: 'invalid-month' } | null {
  if (raw == null || raw === '') return null
  const m = MONTH_RE.exec(raw)
  if (!m) return { error: 'invalid-month' }
  const y = Number(m[1])
  const mo = Number(m[2])
  // Last calendar day via UTC arithmetic — no local-timezone shift.
  const lastDay = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${lastDay}` }
}
