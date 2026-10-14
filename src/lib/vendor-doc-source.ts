import { API_BASE } from './api-base'
import { apiSend, hasServer } from './api-client'
import { findInvite } from './vendor-invite-mock'
import { getVendorDoc, removeVendorDoc as removeMockDoc, saveVendorDoc } from './vendor-doc-mock'
import { loadVendors, saveVendor } from './vendors-mock'

/** Keep the vendor record's has*Doc flags in step with the stored documents. */
function flagMockDoc(vendorId: string, doc: DocKind, present: boolean) {
  const v = loadVendors().find((x) => x.id === vendorId)
  if (!v) return
  saveVendor({ ...v, ...(doc === 'id' ? { hasIdDoc: present } : { hasBankDoc: present }) })
}

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

/**
 * Client-side upload of a vendor document (vendor detail page). Server mode
 * posts to the audited owner-only route; mock mode writes local storage.
 */
export async function uploadVendorDoc(
  owner: { kind: 'vendor'; id: string },
  doc: DocKind,
  dataUrl: string,
): Promise<void> {
  if (hasServer) {
    await apiSend(`/api/client/vendors/${owner.id}/document/${doc}`, 'POST', { dataUrl })
    return
  }
  saveVendorDoc(owner.id, doc, dataUrl)
  flagMockDoc(owner.id, doc, true)
}

/** Client-side removal of a vendor document. Same routing as the upload. */
export async function removeVendorDoc(
  owner: { kind: 'vendor'; id: string },
  doc: DocKind,
): Promise<void> {
  if (hasServer) {
    await apiSend(`/api/client/vendors/${owner.id}/document/${doc}`, 'DELETE')
    return
  }
  removeMockDoc(owner.id, doc)
  flagMockDoc(owner.id, doc, false)
}
