import { loadVendors, saveVendor, maskFromLast4, type ClientVendor } from './vendors-mock'
import { decryptId, encryptId } from './id-crypto'
import { normalizeTaxId } from './taxid'

// Vendor tax ID recall: the full ID is stored ENCRYPTED on the vendor (mock:
// lib/id-crypto.ts; production: server/src/crypto.ts + vendors.id_number_encrypted).
// The plaintext never lives in the vendor list payloads, logs, or exports.
// Recall is explicit (the form asks) and can be forgotten per vendor.

export async function rememberVendorId(vendorId: string, plainId: string): Promise<void> {
  const norm = normalizeTaxId(plainId)
  if (norm.length !== 13) return
  const vendor = loadVendors().find((v) => v.id === vendorId)
  if (!vendor) return
  if (vendor.encryptedId) {
    const existing = await decryptId(vendor.encryptedId)
    if (existing === norm) return // unchanged — avoid re-encrypting on every txn
  }
  saveVendor({
    ...vendor,
    encryptedId: await encryptId(norm),
    taxLast4: norm.slice(-4),
    maskedId: maskFromLast4(norm),
  })
}

export async function recallVendorId(vendorId: string): Promise<string | null> {
  const vendor = loadVendors().find((v) => v.id === vendorId)
  return vendor?.encryptedId ? decryptId(vendor.encryptedId) : null
}

export function forgetVendorId(vendorId: string): void {
  const vendor: ClientVendor | undefined = loadVendors().find((v) => v.id === vendorId)
  if (!vendor) return
  // Drop the encrypted copy *and* the display remnants so nothing stale remains.
  const { encryptedId: _enc, taxId: _plain, taxLast4: _last4, ...rest } = vendor
  saveVendor({ ...rest, maskedId: 'x-xxxx-xxxxx-••-•' })
}
