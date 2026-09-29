import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteItem, loadItems, saveItem, type CatalogItem } from '../lib/items-mock'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { useClientAuth } from '../lib/client-auth'

const QK = ['items'] as const

async function fetchItems(activeTenant: string): Promise<CatalogItem[]> {
  if (hasServer) return (await apiGet<{ items: CatalogItem[] }>('/api/client/items')).items
  return loadItems(activeTenant)
}

export function useItems(search = '') {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant, search],
    queryFn: async (): Promise<CatalogItem[]> => {
      const all = await fetchItems(activeTenant)
      return all.filter((i) => !search || i.name.includes(search))
    },
  })
}

export function useAllItems(): CatalogItem[] {
  const { activeTenant } = useClientAuth()
  const q = useQuery({
    queryKey: [...QK, 'all', activeTenant],
    queryFn: async () => fetchItems(activeTenant),
  })
  return q.data ?? []
}

export function useSaveItem() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; unit: string; unitPrice: number }) => {
      const name = input.name.trim()
      if (name.length < 2) throw new Error('กรุณากรอกชื่อรายการ')
      const unit = input.unit.trim() || 'รายการ'
      const unitPrice = Math.max(0, Number(input.unitPrice) || 0)
      if (hasServer) {
        if (input.id) {
          await apiSend(`/api/client/items/${input.id}`, 'PATCH', { name, unit, unitPrice })
          return { ok: true }
        }
        return apiSend('/api/client/items', 'POST', { name, unit, unitPrice })
      }
      const row: CatalogItem = {
        id: input.id ?? `it-${Date.now().toString(36)}`,
        tenantId: activeTenant,
        name,
        unit,
        unitPrice,
        createdAt: new Date().toISOString(),
      }
      saveItem(row)
      return row
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (hasServer) {
        await apiSend(`/api/client/items/${id}`, 'DELETE')
        return
      }
      deleteItem(id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
