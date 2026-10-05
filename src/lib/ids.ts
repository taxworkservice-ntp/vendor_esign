// Human-readable registry IDs. Auto-assigned, per-workspace running numbers
// (vendor_payees.vendor_no / items.item_no), dressed with a short prefix for
// display: VEN-001, ITM-001. The raw integers stay the source of truth — the
// receipt number segment (RCT-{vendorNo}-…) uses the number, not this form.

export const VENDOR_ID_PREFIX = 'VEN'
export const ITEM_ID_PREFIX = 'ITM'

/** Format a running number as a zero-padded, prefixed registry code. */
export function fmtCode(prefix: string, n: number | null | undefined): string {
  const v = Math.max(0, Math.trunc(Number(n) || 0))
  return `${prefix}-${String(v).padStart(3, '0')}`
}

export const vendorCode = (n: number | null | undefined): string => fmtCode(VENDOR_ID_PREFIX, n)
export const itemCode = (n: number | null | undefined): string => fmtCode(ITEM_ID_PREFIX, n)
