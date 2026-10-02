// Pure WHT math — no runtime/env imports, so the server can use it too.
// config.ts re-exports these for the client.
export type WhtMode = 'deduct' | 'grossup'

/** Canonical label used when มาตรา 50/1 waives withholding below the threshold. */
export const NO_WHT_PAYMENT_TYPE = 'ไม่หักภาษี ณ ที่จ่าย'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * มาตรา 50/1 — whether the gross base falls under the tenant's minimum.
 * `minThreshold <= 0` disables the rule. A zero/absent gross never triggers it.
 */
export function belowWhtThreshold(gross: number, minThreshold: number): boolean {
  return minThreshold > 0 && gross > 0 && gross < minThreshold
}

/**
 * Resolve the effective WHT rate + payment type for a transaction.
 *
 * Below the threshold (and not forced) the rate collapses to 0 and the income
 * is classified "ไม่หักภาษี ณ ที่จ่าย". `forceWht` is the continuous-contract
 * escape hatch: the payer may still withhold voluntarily.
 *
 * One implementation shared by the client form, the mock store, and the server
 * — so the rule cannot drift between them.
 */
export function applyWhtThreshold(
  gross: number,
  rate: number,
  paymentType: string,
  minThreshold: number,
  forceWht: boolean,
): { rate: number; paymentType: string; noWht: boolean } {
  if (!forceWht && belowWhtThreshold(gross, minThreshold)) {
    return { rate: 0, paymentType: NO_WHT_PAYMENT_TYPE, noWht: true }
  }
  return { rate, paymentType, noWht: false }
}

// `amount` is the entered total: the tax base in `deduct`, the vendor's net in
// `grossup`. Returns the base `gross`, `wht`, `net`.
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
