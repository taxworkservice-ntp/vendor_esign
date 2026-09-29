import { normalizeTaxId } from './taxid'

// Vendor matching/verification helpers shared by the picker and the form.
// Pure functions so they are unit-testable and identical to what the form uses.

export interface MatchableVendor {
  name: string
  address: string
  taxId?: string
  maskedId?: string
}

// true/false when the vendor has a registered ID; null when we have nothing to
// compare against (live/API mode may not expose the full ID).
export function vendorTaxIdMatches(vendor: { taxId?: string } | undefined, entered: string): boolean | null {
  if (!vendor?.taxId) return null
  return normalizeTaxId(entered) === normalizeTaxId(vendor.taxId)
}

export function matchesVendorQuery(vendor: MatchableVendor, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const lower = q.toLowerCase()
  if (vendor.name.toLowerCase().includes(lower)) return true
  if (vendor.address.toLowerCase().includes(lower)) return true
  const digits = normalizeTaxId(q)
  if (digits.length >= 3) {
    const id = normalizeTaxId(vendor.taxId ?? '')
    const masked = normalizeTaxId(vendor.maskedId ?? '')
    if (id.includes(digits) || (masked.includes(digits) && digits.length >= 4)) return true
  }
  return false
}
