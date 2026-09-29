// [CONFIG] — editable, never hard-coded tax rules in components.
// Accountant to verify rates + thresholds before pilot sign-off.
export const PILOT_CONFIG = {
  clientCode: import.meta.env.VITE_APP_CLIENT_CODE ?? 'ABC',
  beYear: import.meta.env.VITE_APP_BE_YEAR ?? '2569',
  linkExpiryDays: 7,
  stampDutyWarningThreshold: 20000,
  whtRates: [
    { value: 0, label: 'ไม่หัก WHT — 0%', paymentType: 'ทั่วไป' },
    { value: 1, label: 'ค่าขนส่ง — 1%', paymentType: 'ค่าขนส่ง' },
    { value: 3, label: 'ค่าบริการ — 3%', paymentType: 'ค่าบริการ' },
    { value: 5, label: 'ค่าเช่า — 5%', paymentType: 'ค่าเช่า' },
  ],
  paymentTypes: ['ค่าบริการ', 'ค่าเช่า', 'ค่าขนส่ง', 'ทั่วไป'],
}

const round2 = (n: number) => Math.round(n * 100) / 100

// WHT handling:
//  deduct  — WHT is withheld from the amount; vendor receives amount − WHT.
//  grossup — the amount is what the vendor receives; the base is grossed up so
//            that net = amount (client bears the tax).
export type WhtMode = 'deduct' | 'grossup'

// `amount` is the entered total (line-item sum): the tax base in `deduct`, the
// vendor's net receipt in `grossup`. Returns the tax base `gross`, `wht`, `net`.
export function calcWht(amount: number, ratePct: number, mode: WhtMode = 'deduct') {
  const r = ratePct / 100
  if (mode === 'grossup' && r > 0 && r < 1) {
    const net = round2(amount)
    const gross = round2(net / (1 - r))
    return { gross, wht: round2(gross - net), net }
  }
  const gross = round2(amount)
  const wht = round2(gross * r)
  return { gross, wht, net: round2(gross - wht) }
}

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
