// [CONFIG] — editable, never hard-coded tax rules in components.
// Accountant to verify rates + thresholds before pilot sign-off.
import { DEFAULT_WHT_MIN_THRESHOLD, DEFAULT_WHT_RATES } from './settings-types'

export const PILOT_CONFIG = {
  clientCode: import.meta.env.VITE_APP_CLIENT_CODE ?? 'ABC',
  beYear: import.meta.env.VITE_APP_BE_YEAR ?? '2569',
  linkExpiryDays: 7,
  // มาตรา 50/1 — if gross base is below this, WHT is not required.
  // 0 = disabled (always withhold per selected type).
  whtMinThreshold: DEFAULT_WHT_MIN_THRESHOLD,
  // Revenue Department standard WHT income categories for PND3.
  whtRates: DEFAULT_WHT_RATES,
}

// WHT math lives in wht-calc.ts (import-safe for the server). Re-exported here.
export { calcWht } from './wht-calc'
export type { WhtMode } from './wht-calc'

// Config-driven default WHT rate for a payment type (e.g. ค่าบริการ → 3).
// Unknown types fall back to 0 (not withholding) — never guess a tax rate.
export function whtRateForPaymentType(paymentType: string): number {
  return PILOT_CONFIG.whtRates.find((r) => r.paymentType === paymentType)?.value ?? 0
}

export function isDuplicateSlipRef(ref: string, existing: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
  if (!norm(ref)) return false
  return existing.map(norm).includes(norm(ref))
}
