import { API_BASE } from './api-base'
import { hasServer } from './api-client'
import { getSlip } from './slips-mock'

// Load a payment slip for display. Server mode streams it through the audited,
// owner-only proxy (object URL); mock mode reads the stored data URL.
export async function fetchSlipSrc(txnId: string): Promise<string | null> {
  if (hasServer) {
    try {
      const res = await fetch(`${API_BASE}/api/client/transactions/${txnId}/slip`, { credentials: 'include' })
      if (!res.ok) return null
      return URL.createObjectURL(await res.blob())
    } catch {
      return null
    }
  }
  return getSlip(txnId) ?? null
}
