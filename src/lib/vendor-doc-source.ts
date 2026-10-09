import { API_BASE } from './api-base'
import { hasServer } from './api-client'
import { findInvite } from './vendor-invite-mock'
import { getVendorDoc } from './vendor-doc-mock'

// Fetch a vendor document (ID card / bank-book page) for display. Server mode
// streams it through the audited, owner-only proxy; mock reads local storage.

export type DocOwner = { kind: 'invite' | 'vendor'; id: string }
export type DocKind = 'id' | 'bank'

export async function fetchVendorDoc(owner: DocOwner, doc: DocKind): Promise<string | null> {
  if (hasServer) {
    const base =
      owner.kind === 'invite'
        ? `/api/client/vendor-invites/${owner.id}/document/${doc}`
        : `/api/client/vendors/${owner.id}/document/${doc}`
    try {
      const res = await fetch(`${API_BASE}${base}`, { credentials: 'include' })
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }
  if (owner.kind === 'invite') {
    const inv = findInvite(owner.id)
    return (doc === 'id' ? inv?.idDocData : inv?.bankDocData) ?? null
  }
  return getVendorDoc(owner.id, doc) ?? null
}
