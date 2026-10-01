import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadVendors, maskFromLast4, nextVendorNo, removeVendor, saveVendor, type ClientVendor } from '../lib/vendors-mock'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { getVendorMemorySource, vendorMemoryEnabled } from '../lib/vendor-memory-source'
import type { VendorMemory } from '../lib/vendor-memory'
import { forgetVendorId, recallVendorId } from '../lib/vendor-id'
import { encryptId } from '../lib/id-crypto'
import { normalizeTaxId } from '../lib/taxid'
import { loadTxns } from '../lib/mock'
import { isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { matchesSearch, vendorSearchFields } from '../lib/search-match'
import { useClientAuth } from '../lib/client-auth'

const QK = ['vendors'] as const

// Runs on the server when VITE_API_BASE is set, else the local mock store.
//
// A supplier register is a small bounded list — the supplier count, not the
// transaction count — so it is fetched whole and filtered here rather than
// paged. That is also the only way to search the last 4 digits of a tax ID: the
// stored number is encrypted at rest with no indexed column, so no amount of
// server-side pushdown can reach it. Debouncing (in the page) is what keeps the
// whole-list fetch from happening on every keystroke.
async function fetchVendors(activeTenant: string, includeArchived = false): Promise<ClientVendor[]> {
  if (hasServer) {
    const q = includeArchived ? '?includeArchived=1' : ''
    return (await apiGet<{ vendors: ClientVendor[] }>(`/api/client/vendors${q}`)).vendors
  }
  const all = loadVendors(activeTenant)
  return includeArchived ? all : all.filter((v) => v.isActive !== false)
}

export type VendorSort = 'recent' | 'name' | 'outstanding' | 'activity'

/** Thai collation, so "ก" and "ข" order correctly rather than by code unit. */
export function sortVendors(vendors: ClientVendor[], sort: VendorSort): ClientVendor[] {
  const byName = (a: ClientVendor, b: ClientVendor) => a.name.localeCompare(b.name, 'th')
  const out = [...vendors]
  switch (sort) {
    case 'name':
      return out.sort(byName)
    case 'outstanding':
      return out.sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0) || byName(a, b))
    case 'activity':
      // Suppliers that never transacted sort last, not first.
      return out.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || byName(a, b))
    case 'recent':
    default:
      return out
  }
}

export function useVendors(search = '', sort: VendorSort = 'recent', includeArchived = false) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant, search, sort, includeArchived],
    queryFn: async (): Promise<ClientVendor[]> => {
      const all = await fetchVendors(activeTenant, includeArchived)
      return sortVendors(all.filter((v) => matchesSearch(vendorSearchFields(v), search)), sort)
    },
  })
}

export function useVendor(id?: string) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'detail', activeTenant, id],
    enabled: !!id,
    // includeArchived: a detail page must still resolve a supplier the register
    // hides, or archiving would make the page unreachable.
    queryFn: async () => (await fetchVendors(activeTenant, true)).find((v) => v.id === id),
  })
}

export function useAllVendors(): ClientVendor[] {
  const { activeTenant } = useClientAuth()
  const q = useQuery({
    queryKey: [...QK, 'all', activeTenant],
    queryFn: async () => fetchVendors(activeTenant),
  })
  return q.data ?? []
}

// Remembered defaults for a vendor, derived from transaction history.
// Cached briefly; invalidated when a transaction is created or voided.
export function useVendorMemory(vendorId?: string) {
  return useQuery({
    queryKey: ['vendor-memory', vendorId],
    enabled: !!vendorId && vendorMemoryEnabled(),
    staleTime: 30_000,
    queryFn: async (): Promise<VendorMemory> => getVendorMemorySource().get(vendorId as string),
  })
}

// Decrypted tax ID for a vendor (recall into a new transaction). Stored encrypted
// at rest; only fetched when explicitly needed for the form.
export function useRecalledVendorId(vendorId?: string) {
  return useQuery({
    queryKey: ['vendor-id', vendorId],
    enabled: !!vendorId,
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      if (hasServer) {
        try {
          return (await apiGet<{ taxId: string | null }>(`/api/client/vendors/${vendorId}/tax-id`)).taxId
        } catch {
          return null
        }
      }
      return recallVendorId(vendorId as string)
    },
  })
}

export function useForgetVendorId() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vendorId: string) => {
      forgetVendorId(vendorId)
    },
    onSuccess: (_d, vendorId) => {
      qc.invalidateQueries({ queryKey: QK })
      qc.invalidateQueries({ queryKey: ['vendor-id', vendorId] })
    },
  })
}

export function useCreateVendor() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (input: {
      prefix: string
      name: string
      address: string
      taxId: string
      lineUserId?: string
      phone?: string
      email?: string
    }): Promise<ClientVendor> => {
      const prefix = input.prefix.trim()
      const name = input.name.trim()
      if (name.length < 2) throw new Error('กรุณากรอกชื่อผู้ขาย')
      if (prefixRequired(name) && !isVendorPrefix(prefix)) throw new Error('กรุณาเลือกคำนำหน้าชื่อ')
      if (input.address.trim().length < 4) throw new Error('กรุณากรอกที่อยู่ผู้ขาย')
      if (hasServer) {
        const res = await apiSend<{ ok: boolean; vendor: ClientVendor }>('/api/client/vendors', 'POST', { ...input, prefix })
        return res.vendor
      }
      const taxId = input.taxId.replace(/\D/g, '').slice(0, 13)
      const row: ClientVendor = {
        id: `v-${Date.now().toString(36)}`,
        tenantId: activeTenant,
        vendorNo: nextVendorNo(activeTenant),
        prefix: isVendorPrefix(prefix) ? prefix : '',
        name,
        address: input.address.trim(),
        maskedId: maskFromLast4(taxId),
        taxId: taxId || undefined,
        taxLast4: taxId.slice(-4) || undefined,
        lineUserId: input.lineUserId?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        createdAt: new Date().toISOString(),
      }
      saveVendor(row)
      return row
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useUpdateVendor(id?: string) {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<ClientVendor, 'prefix' | 'name' | 'address' | 'lineUserId' | 'phone' | 'email'>> & { idNumber?: string }) => {
      if (patch.name !== undefined) {
        const n = patch.name.trim()
        if (n.length < 2) throw new Error('กรุณากรอกชื่อผู้ขาย')
        if (prefixRequired(n) && !isVendorPrefix((patch.prefix ?? '').trim())) throw new Error('กรุณาเลือกคำนำหน้าชื่อ')
      }
      if (patch.address !== undefined && patch.address.trim().length < 4) throw new Error('กรุณากรอกที่อยู่ผู้ขาย')
      if (patch.idNumber !== undefined) {
        const norm = normalizeTaxId(patch.idNumber)
        if (norm && norm.length !== 13) throw new Error('เลขบัตรประชาชนต้องเป็นเลข 13 หลัก')
      }
      if (hasServer) {
        await apiSend(`/api/client/vendors/${id}`, 'PATCH', patch)
        return { ok: true }
      }
      const cur = loadVendors(activeTenant).find((v) => v.id === id)
      if (!cur) throw new Error('ไม่พบผู้ขาย')
      const prefix = patch.prefix !== undefined ? patch.prefix.trim() : cur.prefix
      const next: ClientVendor = {
        ...cur,
        prefix: isVendorPrefix(prefix) ? prefix : '',
        name: (patch.name ?? cur.name).trim(),
        address: (patch.address ?? cur.address).trim(),
        lineUserId: patch.lineUserId !== undefined ? (patch.lineUserId.trim() || undefined) : cur.lineUserId,
        phone: patch.phone !== undefined ? (patch.phone.trim() || undefined) : cur.phone,
        email: patch.email !== undefined ? (patch.email.trim() || undefined) : cur.email,
      }
      if (patch.idNumber !== undefined) {
        const norm = normalizeTaxId(patch.idNumber)
        if (norm.length === 13) {
          next.encryptedId = await encryptId(norm)
          next.taxId = norm
          next.taxLast4 = norm.slice(-4)
          next.maskedId = maskFromLast4(norm)
        } else {
          delete next.encryptedId
          delete next.taxId
          delete next.taxLast4
          next.maskedId = 'x-xxxx-xxxxx-••-•'
        }
      }
      saveVendor(next)
      return { ok: true }
    },
    onSuccess: (_d, patch) => {
      qc.invalidateQueries({ queryKey: QK })
      qc.invalidateQueries({ queryKey: ['vendor-id', id] })
      if (patch.idNumber !== undefined) qc.invalidateQueries({ queryKey: ['vendor-memory'] })
    },
  })
}

// Archive / restore a supplier. Once a transaction references a vendor, DELETE
// is refused (server 409 vendor-in-use, mock enforces the same), so without an
// archive state the register accumulated dead suppliers permanently. Archiving
// hides them from the default view while every past document stays intact.
export function useSetVendorActive() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      if (hasServer) {
        await apiSend(`/api/client/vendors/${v.id}`, 'PATCH', { isActive: v.isActive })
        return
      }
      const cur = loadVendors(activeTenant).find((x) => x.id === v.id)
      if (!cur) throw new Error('ไม่พบผู้ขาย')
      saveVendor({ ...cur, isActive: v.isActive })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

// Delete a vendor. Blocked when any transaction references it (accounting/audit
// integrity) — both the server (409 vendor-in-use) and the mock enforce this.
export function useDeleteVendor() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (vendorId: string) => {
      if (hasServer) {
        await apiSend(`/api/client/vendors/${vendorId}`, 'DELETE')
        return
      }
      if (loadTxns().some((t) => t.vendor.id === vendorId)) {
        throw new Error('มีธุรกรรมอ้างอิงผู้ขายรายนี้ — ลบไม่ได้')
      }
      forgetVendorId(vendorId)
      removeVendor(vendorId)
    },
    onSuccess: (_d, vendorId) => {
      qc.invalidateQueries({ queryKey: QK })
      qc.invalidateQueries({ queryKey: ['vendor-id', vendorId] })
    },
  })
}
