// Pure WHT math — no runtime/env imports, so the server can use it too.
// config.ts re-exports these for the client.
export type WhtMode = 'deduct' | 'grossup'

const round2 = (n: number) => Math.round(n * 100) / 100

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
