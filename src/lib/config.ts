// [CONFIG] — editable, never hard-coded tax rules in components.
// Accountant to verify rates + thresholds before pilot sign-off.
export const PILOT_CONFIG = {
  clientCode: import.meta.env.VITE_APP_CLIENT_CODE ?? 'ABC',
  beYear: import.meta.env.VITE_APP_BE_YEAR ?? '2569',
  linkExpiryDays: 7,
  stampDutyWarningThreshold: 20000,
  whtRates: [
    { value: 0, label: 'ไม่หักภาษี ณ ที่จ่าย — 0%', paymentType: 'ทั่วไป' },
    { value: 1, label: 'ค่าขนส่ง — 1%', paymentType: 'ค่าขนส่ง' },
    { value: 3, label: 'ค่าบริการ — 3%', paymentType: 'ค่าบริการ' },
    { value: 5, label: 'ค่าเช่า — 5%', paymentType: 'ค่าเช่า' },
  ],
  paymentTypes: ['ค่าบริการ', 'ค่าเช่า', 'ค่าขนส่ง', 'ทั่วไป'],
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
