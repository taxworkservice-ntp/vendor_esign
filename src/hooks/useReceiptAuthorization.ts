import { useQuery } from '@tanstack/react-query'
import { apiGet, hasServer } from '../lib/api-client'
import { useClientAuth } from '../lib/client-auth'
import { getAuthMeta, type VendorAuthMeta, type VendorCorrection } from './useVendor'
import { getSignature } from '../lib/sig-store'

// The vendor's signed authorization for a transaction, from either path.
//
// ReceiptView used to call getAuth() — a mock-only function that read an
// in-memory Map — so on the server path it always came back undefined: no
// signature, and the vendor's own spelling of their name silently replaced by
// the client's. This hook is the single source for both, matching the shape
// returned by GET /api/client/transactions/:id/authorization, so the on-screen
// sheet and the issued PDF agree.

export interface ReceiptAuthorization extends VendorAuthMeta {
  /** data URL, or null when the image could not be retrieved. */
  signaturePng: string | null
  /** The authorization's own reference (assigned at signing). */
  authRef?: string
  /** Masked vendor ID from the authorization snapshot. */
  maskedId?: string
  // Signing trail (evidence panel).
  ip?: string
  userAgent?: string
  lineUserId?: string
  openedAt?: string
  unlockedAt?: string
  /** Current payable status ('issued' | 'void' | …). */
  status?: string
  voidReason?: string
}

const QK = ['receipt-auth'] as const

/** A signed row with no metadata at all (mock before the store was readable). */
const EMPTY: ReceiptAuthorization = {
  signaturePng: null,
  vendorPrefix: '',
  vendorName: '',
  vendorAddress: '',
  vendorIdLast4: '',
  verificationMethod: 'stub-deferred',
  consentVersion: 'v1',
  signedAt: '',
  corrections: [],
}

/** The signed authorization for one transaction. Shared by the hook and the
 *  batch receipt export, which calls it per row. */
export async function fetchReceiptAuthorization(txnId: string): Promise<ReceiptAuthorization> {
  if (hasServer) {
    return apiGet<ReceiptAuthorization>(`/api/client/transactions/${txnId}/authorization`)
  }
  // Mock: metadata in localStorage, image in IndexedDB. They can disagree
  // in private mode, which is why the two are read independently and the
  // result is merged — the caller distinguishes "not signed" from "signed
  // but the image is missing".
  const [meta, png] = await Promise.all([Promise.resolve(getAuthMeta(txnId)), getSignature(txnId)])
  if (!meta) return { ...EMPTY, signaturePng: png ?? null }
  return { ...meta, signaturePng: png ?? null, corrections: meta.corrections ?? [] }
}

export function useReceiptAuthorization(txnId?: string): {
  data: ReceiptAuthorization | undefined
  isLoading: boolean
  isError: boolean
} {
  const { activeTenant } = useClientAuth()
  const id = txnId

  return useQuery({
    queryKey: [...QK, activeTenant, id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<ReceiptAuthorization> => (id ? fetchReceiptAuthorization(id) : EMPTY),
  })
}
