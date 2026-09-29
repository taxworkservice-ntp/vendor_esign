// Receipt number: {CLIENTCODE}-R-{BE_YEAR}-{NNN} — 3-digit running number per
// tenant per year, e.g. ABC-R-2569-001. Assigned once at issuance and stored on
// the transaction (never recomputed). Server parity: receipt_counters + next_receipt_number().

export function receiptPrefix(clientCode: string, beYear: number): string {
  return `${clientCode}-R-${beYear}-`
}

export function formatReceiptNumber(clientCode: string, beYear: number, n: number): string {
  return `${receiptPrefix(clientCode, beYear)}${String(n).padStart(3, '0')}`
}

// Mock sequencing: next number = max(existing in this tenant+year) + 1.
// The server issues numbers atomically from the counter table instead.
export function nextReceiptNumber(clientCode: string, beYear: number, existing: (string | undefined)[]): string {
  const p = receiptPrefix(clientCode, beYear)
  let max = 0
  for (const v of existing) {
    if (v && v.startsWith(p)) {
      const n = parseInt(v.slice(p.length), 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return formatReceiptNumber(clientCode, beYear, max + 1)
}
