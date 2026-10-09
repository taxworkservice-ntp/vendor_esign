import { calcWht } from './wht-calc'

// "Vendor wants to receive the full amount" helper.
//
// There is no gross-up *mode*: the client negotiates the price as the GROSS and
// WHT deducts from it as usual. This computes the gross needed so the vendor nets
// the requested amount, and scales line totals to that gross. Rounding residue is
// absorbed by the last positive line so the sum is exact.

const round2 = (n: number) => Math.round(n * 100) / 100

/** Gross (tax base) required so the vendor nets `net` after `ratePct` withholding. */
export function grossForNet(net: number, ratePct: number): number {
  return calcWht(net, ratePct, 'grossup').gross
}

/**
 * Scale `amounts` proportionally so they sum to `target`. The last positive line
 * absorbs any rounding residue, so the result sums to `target` exactly.
 * Returns the input unchanged when it has no positive total.
 */
export function scaleAmountsToTarget(amounts: number[], target: number): number[] {
  const current = amounts.reduce((a, b) => a + b, 0)
  if (!(current > 0)) return amounts
  const ratio = target / current
  const out = amounts.map((a) => (a > 0 ? round2(a * ratio) : 0))
  let lastPositive = -1
  for (let i = 0; i < out.length; i++) if (out[i] > 0) lastPositive = i
  if (lastPositive >= 0) {
    const others = out.reduce((sum, a, i) => (i === lastPositive ? sum : sum + a), 0)
    out[lastPositive] = round2(target - others)
  }
  return out
}
