import { apiGet, apiSend, hasServer } from './api-client'
import {
  findInvite,
  findInviteByToken,
  loadInvites,
  newInviteId,
  newInviteToken,
  saveInvite,
} from './vendor-invite-mock'
import { loadVendors, maskFromLast4, nextVendorNo, saveVendor, type ClientVendor } from './vendors-mock'
import { encryptId } from './id-crypto'
import { saveVendorDoc } from './vendor-doc-mock'
import { isValidTaxIdChecksum, normalizeTaxId, taxIdHash } from './taxid'
import {
  CONSENT_VERSION,
  INVITE_TTL_DAYS,
  type VendorInvite,
  type VendorInviteDraft,
  type VendorInvitePublic,
} from './vendor-invite'

// Port/adapter mirroring vendor-memory-source: the server routes when
// VITE_API_BASE is set, else the local mock store. Same contract either way.

function expiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString()
}

/** Loose name match for the bank-account-holder check (case/space insensitive). */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  return norm(a) !== '' && norm(a) === norm(b)
}

async function duplicateOf(tenantId: string, taxId: string): Promise<string | undefined> {
  if (!taxId) return undefined
  const hash = await taxIdHash(taxId)
  for (const v of loadVendors(tenantId)) {
    if (v.taxId && (await taxIdHash(v.taxId)) === hash) return v.id
  }
  return undefined
}

export async function listVendorInvites(tenantId: string): Promise<VendorInvite[]> {
  if (hasServer) {
    return (await apiGet<{ invites: VendorInvite[] }>('/api/client/vendor-invites')).invites
  }
  const all = loadInvites(tenantId)
  const enriched = await Promise.all(
    all.map(async (inv) => {
      if (inv.status === 'submitted' && inv.draft && inv.duplicateOf === undefined) {
        return { ...inv, duplicateOf: await duplicateOf(tenantId, inv.draft.taxId) }
      }
      return inv
    }),
  )
  return enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createVendorInvite(tenantId: string, label?: string): Promise<VendorInvite> {
  if (hasServer) {
    return (await apiSend<{ invite: VendorInvite }>('/api/client/vendor-invites', 'POST', { label })).invite
  }
  const invite: VendorInvite = {
    id: newInviteId(),
    tenantId,
    status: 'invited',
    token: newInviteToken(),
    label: label?.trim() || undefined,
    createdAt: new Date().toISOString(),
    expiresAt: expiry(),
  }
  saveInvite(invite)
  return invite
}

export async function getVendorInviteByToken(token: string): Promise<VendorInvitePublic | null> {
  if (hasServer) {
    try {
      return await apiGet<VendorInvitePublic>(`/api/vendor-invite/${encodeURIComponent(token)}`)
    } catch {
      return null
    }
  }
  const inv = findInviteByToken(token)
  if (!inv) return null
  if (new Date(inv.expiresAt) < new Date() && !['submitted', 'approved'].includes(inv.status)) {
    inv.status = 'expired'
    saveInvite(inv)
  } else if (inv.status === 'invited') {
    inv.status = 'opened'
    inv.openedAt = new Date().toISOString()
    saveInvite(inv)
  }
  return { status: inv.status, draft: inv.draft, reviewNote: inv.reviewNote, expiresAt: inv.expiresAt }
}

export async function submitVendorInvite(
  token: string,
  draft: VendorInviteDraft,
  docs: { idDocData: string; idDocName: string; bankDocData: string; bankDocName: string },
): Promise<{ ok: boolean; error?: string }> {
  const taxId = normalizeTaxId(draft.taxId)
  if (!isValidTaxIdChecksum(taxId)) return { ok: false, error: 'invalid-taxid' }
  if (hasServer) {
    try {
      await apiSend(`/api/vendor-invite/${encodeURIComponent(token)}/submit`, 'POST', {
        ...draft,
        ...docs,
        consentVersion: CONSENT_VERSION,
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'submit-failed' }
    }
  }
  const inv = findInviteByToken(token)
  if (!inv) return { ok: false, error: 'invalid' }
  if (['approved', 'rejected'].includes(inv.status)) return { ok: false, error: 'closed' }
  inv.draft = draft
  inv.idDocName = docs.idDocName
  inv.idDocData = docs.idDocData
  inv.bankDocName = docs.bankDocName
  inv.bankDocData = docs.bankDocData
  inv.consentVersion = CONSENT_VERSION
  inv.consentedAt = new Date().toISOString()
  inv.bankNameMatch = namesMatch(draft.accountHolder, draft.name)
  inv.status = 'submitted'
  inv.submittedAt = new Date().toISOString()
  saveInvite(inv)
  return { ok: true }
}

export async function reviewVendorInvite(
  id: string,
  action: 'approve' | 'reject' | 'request-changes',
  note?: string,
): Promise<{ ok: boolean; vendorId?: string }> {
  if (hasServer) {
    const path = action === 'request-changes' ? 'request-changes' : action
    return apiSend<{ ok: boolean; vendorId?: string }>(`/api/client/vendor-invites/${id}/${path}`, 'POST', { note })
  }
  const inv = findInvite(id)
  if (!inv) throw new Error('ไม่พบคำเชิญ')
  if (action === 'approve') {
    if (!inv.draft) throw new Error('ยังไม่มีข้อมูลให้อนุมัติ')
    const vendor = await createVendorFromDraft(inv.tenantId, inv.draft)
    // Keep the uploaded documents on the vendor record (server: R2 paths).
    if (inv.idDocData) {
      saveVendorDoc(vendor.id, 'id', inv.idDocData)
      vendor.hasIdDoc = true
    }
    if (inv.bankDocData) {
      saveVendorDoc(vendor.id, 'bank', inv.bankDocData)
      vendor.hasBankDoc = true
    }
    saveVendor(vendor)
    inv.vendorId = vendor.id
    inv.status = 'approved'
    inv.reviewedAt = new Date().toISOString()
    inv.reviewNote = note
    saveInvite(inv)
    return { ok: true, vendorId: vendor.id }
  }
  inv.status = action === 'reject' ? 'rejected' : 'changes_requested'
  inv.reviewedAt = new Date().toISOString()
  inv.reviewNote = note
  saveInvite(inv)
  return { ok: true }
}

export async function resendVendorInvite(id: string): Promise<VendorInvite> {
  if (hasServer) {
    return (await apiSend<{ invite: VendorInvite }>(`/api/client/vendor-invites/${id}/resend`, 'POST')).invite
  }
  const inv = findInvite(id)
  if (!inv) throw new Error('ไม่พบคำเชิญ')
  inv.token = newInviteToken()
  inv.expiresAt = expiry()
  inv.status = 'invited'
  saveInvite(inv)
  return inv
}

async function createVendorFromDraft(tenantId: string, draft: VendorInviteDraft): Promise<ClientVendor> {
  const taxId = normalizeTaxId(draft.taxId)
  const row: ClientVendor = {
    id: `v-${Date.now().toString(36)}`,
    tenantId,
    vendorNo: nextVendorNo(tenantId),
    prefix: draft.prefix.trim(),
    name: draft.name.trim(),
    address: draft.address.trim(),
    maskedId: maskFromLast4(taxId),
    taxId: taxId || undefined,
    taxLast4: taxId.slice(-4) || undefined,
    encryptedId: taxId ? await encryptId(taxId) : undefined,
    lineUserId: draft.lineUserId?.trim() || undefined,
    phone: draft.phone?.trim() || undefined,
    email: draft.email?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }
  saveVendor(row)
  return row
}

/** Public link for an invite token. */
export function inviteUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/onboard/${token}`
}
