import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadVendors, maskFromLast4, saveVendor, type ClientVendor } from '../lib/vendors-mock'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { getVendorMemorySource, vendorMemoryEnabled } from '../lib/vendor-memory-source'
import type { VendorMemory } from '../lib/vendor-memory'
import { forgetVendorId, recallVendorId } from '../lib/vendor-id'
import { useClientAuth } from '../lib/client-auth'

const QK = ['vendors'] as const

// Runs on the server when VITE_API_BASE is set, else the local mock store.
async function fetchVendors(activeTenant: string): Promise<ClientVendor[]> {
  if (hasServer) return (await apiGet<{ vendors: ClientVendor[] }>('/api/client/vendors')).vendors
  return loadVendors(activeTenant)
}

export function useVendors(search = '') {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant, search],
    queryFn: async (): Promise<ClientVendor[]> => {
      const all = await fetchVendors(activeTenant)
      return all.filter((v) => !search || v.name.includes(search) || v.address.includes(search))
    },
  })
}

export function useVendor(id?: string) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'detail', activeTenant, id],
    enabled: !!id,
    queryFn: async () => (await fetchVendors(activeTenant)).find((v) => v.id === id),
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
    queryFn: async (): Promise<string | null> => recallVendorId(vendorId as string),
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
      name: string
      address: string
      taxId: string
      lineUserId?: string
    }): Promise<ClientVendor> => {
      const name = input.name.trim()
      if (name.length < 2) throw new Error('กรุณากรอกชื่อผู้ขาย')
      if (input.address.trim().length < 4) throw new Error('กรุณากรอกที่อยู่ผู้ขาย')
      if (hasServer) {
        const res = await apiSend<{ ok: boolean; vendor: ClientVendor }>('/api/client/vendors', 'POST', input)
        return res.vendor
      }
      const taxId = input.taxId.replace(/\D/g, '').slice(0, 13)
      const row: ClientVendor = {
        id: `v-${Date.now().toString(36)}`,
        tenantId: activeTenant,
        name,
        address: input.address.trim(),
        maskedId: maskFromLast4(taxId),
        taxId: taxId || undefined,
        taxLast4: taxId.slice(-4) || undefined,
        lineUserId: input.lineUserId?.trim() || undefined,
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
    mutationFn: async (patch: Partial<Pick<ClientVendor, 'name' | 'address' | 'lineUserId'>>) => {
      if (hasServer) {
        await apiSend(`/api/client/vendors/${id}`, 'PATCH', patch)
        return { ok: true }
      }
      const cur = loadVendors(activeTenant).find((v) => v.id === id)
      if (!cur) throw new Error('ไม่พบผู้ขาย')
      saveVendor({ ...cur, ...patch, name: (patch.name ?? cur.name).trim(), address: (patch.address ?? cur.address).trim() })
      return { ok: true }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
