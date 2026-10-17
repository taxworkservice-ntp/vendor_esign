import { normalizeTaxId } from './taxid'
import { vendorMatches } from './search-match'

// Vendor matching/verification helpers shared by the picker and the form.
// Pure functions so they are unit-testable and identical to what the form uses.

export interface MatchableVendor {
  name: string
  address: string
  prefix?: string
  vendorNo?: number
  taxId?: string
  phone?: string
}

// true/false when the vendor has a registered ID; null when we have nothing to
// compare against (live/API mode may not expose the full ID).
export function vendorTaxIdMatches(vendor: { taxId?: string } | undefined, entered: string): boolean | null {
  if (!vendor?.taxId) return null
  return normalizeTaxId(entered) === normalizeTaxId(vendor.taxId)
}

// One search everywhere — the register and the picker share `vendorMatches`.
export function matchesVendorQuery(vendor: MatchableVendor, query: string): boolean {
  return vendorMatches(vendor, query)
}
