import { apiGet, hasServer } from './api-client'
import { loadTxns } from './mock'
import { maskVendorName, mockReceiptNumber, mockVerificationCode } from './receipt'

// Public receipt verification: status + issue date + masked details ONLY.
// Server path hits the unauthenticated GET /api/verify/:code; the mock path
// keeps local dev working. Returns null for "unknown code" (a 404), and throws
// for a real error so the page can tell "not found" from "check failed".

export interface ReceiptVerification {
  number: string
  /** 'issued' | 'void' | … (a voided receipt overrides the receipt row's status). */
  status: string
  issueDate: string
  signedAt?: string
  verificationMethod?: string
  vendorMasked?: string
  voidReason?: string | null
}

export async function fetchReceiptVerification(code: string): Promise<ReceiptVerification | null> {
  const c = (code ?? '').trim()
  if (!c) return null

  if (hasServer) {
    try {
      return await apiGet<ReceiptVerification>(`/api/verify/${encodeURIComponent(c)}`)
    } catch (e) {
      if (e instanceof Error && e.message === 'not-found') return null
      throw e
    }
  }

  // Mock: the code is derived from the transaction id.
  const t = loadTxns().find((x) => mockVerificationCode(x.id) === c.toUpperCase())
  if (!t) return null
  return {
    number: t.receiptNumber ?? mockReceiptNumber(t.id, t.vendor.vendorNo ?? 0),
    status: t.status,
    issueDate: t.transferDate,
    vendorMasked: maskVendorName(t.vendor.name),
  }
}
