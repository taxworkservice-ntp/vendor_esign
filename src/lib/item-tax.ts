// Item-driven tax: the catalog item carries the WHT payment type, and the
// transaction inherits it — nobody picks a rate on the form. Shared by the
// client (display + pre-submit check) and the server (authoritative check),
// so both sides resolve identically.

export interface ItemTaxRef {
  paymentType?: string | null
}

export type TaxResolveError = 'no-items' | 'missing-item-tax' | 'mixed-tax-types'

/**
 * Resolve one payment type for a set of priced line items. Runs on valid
 * (priced) rows only — a zero-amount row must not block or sway the result.
 */
export function resolveTransactionTax(
  items: ItemTaxRef[],
): { ok: true; paymentType: string } | { ok: false; error: TaxResolveError } {
  if (items.length === 0) return { ok: false, error: 'no-items' }
  const types = items.map((it) => (it.paymentType ?? '').trim()).filter(Boolean)
  if (types.length === 0) return { ok: false, error: 'missing-item-tax' }
  // Rows without a resolved type are ignored here: the picker never produces
  // them, and the server rejects them separately as missing-item-tax.
  const first = types[0]
  if (!types.every((t) => t === first)) return { ok: false, error: 'mixed-tax-types' }
  return { ok: true, paymentType: first }
}

/**
 * Selection-only enforcement for sub-notes: every ticked note must come from
 * the item's defined list. The officer can tick/untick, never invent.
 */
export function subNotesSubset(selected: string[] | undefined, defined: string[] | undefined): boolean {
  const sel = (selected ?? []).map((s) => s.trim()).filter(Boolean)
  if (sel.length === 0) return true
  const allowed = new Set((defined ?? []).map((s) => s.trim()).filter(Boolean))
  return sel.every((s) => allowed.has(s))
}

/** Clean a sub-note list for storage: trim, drop empties/dupes, cap size. */
export function cleanSubNotes(raw: unknown, maxItems = 10, maxLen = 120): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const s = v.trim().slice(0, maxLen)
    if (s && !out.includes(s) && out.length < maxItems) out.push(s)
  }
  return out
}
