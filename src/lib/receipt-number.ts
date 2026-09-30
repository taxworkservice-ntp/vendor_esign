// Receipt number: RCT-{VENDORNO}-{BE_YEAR}-{SEQ} — the receipt is the vendor's
// own document, so there is no client prefix. Each vendor has its own running
// book, so SEQ restarts at 001 per vendor (per BE year), e.g. RCT-001-2569-001
// (vendor 001, first receipt). The vendor segment keeps numbers unique across
// vendors; the year keeps them unique across years.

const pad = (n: number) => String(n).padStart(3, '0')

export function vendorReceiptPrefix(vendorNo: number, beYear: number): string {
  return `RCT-${pad(vendorNo)}-${beYear}-`
}

export function formatReceiptNumber(vendorNo: number, beYear: number, seq: number): string {
  return `${vendorReceiptPrefix(vendorNo, beYear)}${pad(seq)}`
}

// Mock sequencing: next = max(existing for this vendor+year) + 1. The server
// issues numbers atomically from the counter table instead.
export function nextReceiptNumber(
  vendorNo: number,
  beYear: number,
  existing: (string | undefined)[],
): string {
  const p = vendorReceiptPrefix(vendorNo, beYear)
  let max = 0
  for (const v of existing) {
    if (v && v.startsWith(p)) {
      const n = parseInt(v.slice(p.length), 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return formatReceiptNumber(vendorNo, beYear, max + 1)
}
