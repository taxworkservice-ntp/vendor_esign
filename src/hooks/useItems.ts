import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteItem, loadItems, saveItem, type CatalogItem } from '../lib/items-mock'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { useClientAuth } from '../lib/client-auth'
import { isDuplicateItemName, itemSearchFields, matchesSearch } from '../lib/search-match'

const QK = ['items'] as const

async function fetchItems(activeTenant: string, includeArchived = false): Promise<CatalogItem[]> {
  if (hasServer) {
    const q = includeArchived ? '?includeArchived=1' : ''
    return (await apiGet<{ items: CatalogItem[] }>(`/api/client/items${q}`)).items
  }
  const all = loadItems(activeTenant)
  return includeArchived ? all : all.filter((i) => i.isActive !== false)
}

export type ItemSort = 'recent' | 'name' | 'price-desc' | 'price-asc'

export function sortItems(items: CatalogItem[], sort: ItemSort): CatalogItem[] {
  const byName = (a: CatalogItem, b: CatalogItem) => a.name.localeCompare(b.name, 'th')
  const out = [...items]
  switch (sort) {
    case 'name':
      return out.sort(byName)
    case 'price-desc':
      return out.sort((a, b) => b.unitPrice - a.unitPrice || byName(a, b))
    case 'price-asc':
      return out.sort((a, b) => a.unitPrice - b.unitPrice || byName(a, b))
    case 'recent':
    default:
      return out
  }
}

// A catalogue is a small bounded list, so it is fetched whole and filtered
// locally. The page debounces its input so this does not re-run per keystroke.
export function useItems(search = '', sort: ItemSort = 'recent', includeArchived = false) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant, search, sort, includeArchived],
    queryFn: async (): Promise<CatalogItem[]> => {
      const all = await fetchItems(activeTenant, includeArchived)
      return sortItems(all.filter((i) => matchesSearch(itemSearchFields(i), search)), sort)
    },
  })
}

export function useAllItems(): CatalogItem[] {
  const { activeTenant } = useClientAuth()
  const q = useQuery({
    queryKey: [...QK, 'all', activeTenant],
    // The picker offers what can still be used, so archived entries stay out.
    queryFn: () => fetchItems(activeTenant),
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
        try {
          return await apiSend('/api/client/items', 'POST', { name, unit, unitPrice })
        } catch (e) {
          // The server owns uniqueness (migration 015); translate its conflict
          // into the same message the mock produces, so the UI behaves the same
          // on both paths.
          if (e instanceof Error && e.message === 'duplicate-item') {
            throw new Error(`มีรายการชื่อ “${name}” อยู่แล้ว — กรุณาใช้ชื่ออื่น หรือแก้ไขรายการเดิม`)
          }
          throw e
        }
      }

      // Mock-side check, mirroring the unique index.
      const clash = loadItems(activeTenant).find(
        (i) => i.id !== input.id && isDuplicateItemName(i.name, name),
      )
      if (clash) {
        throw new Error(`มีรายการชื่อ “${clash.name}” อยู่แล้ว — กรุณาใช้ชื่ออื่น หรือแก้ไขรายการเดิม`)
      }

      const prev = input.id ? loadItems(activeTenant).find((i) => i.id === input.id) : undefined
      const row: CatalogItem = {
        id: input.id ?? `it-${Date.now().toString(36)}`,
        tenantId: activeTenant,
        name,
        unit,
        unitPrice,
        isActive: prev?.isActive ?? true,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      }
      saveItem(row)
      return row
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

/** Archive / restore a catalogue entry instead of deleting it. */
export function useSetItemActive() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      if (hasServer) {
        await apiSend(`/api/client/items/${v.id}`, 'PATCH', { isActive: v.isActive })
        return
      }
      const cur = loadItems(activeTenant).find((i) => i.id === v.id)
      if (!cur) throw new Error('ไม่พบรายการ')
      saveItem({ ...cur, isActive: v.isActive })
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
