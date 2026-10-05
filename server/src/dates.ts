// Neon's serverless driver returns `date`/`timestamp` columns as JS `Date`
// objects at local midnight. Format them as a calendar day with local getters:
// toISOString() would shift a day on non-UTC servers, and String(date) yields
// "Tue Sep 22 2026 ..." which is not a valid SQL/JSON date.
export function isoDay(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s
}
