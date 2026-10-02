import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWhtByIds, fetchWhtByScope, fetchWhtList, setWhtRecordStatus, type WhtListResult } from '../lib/wht-source'
import { whtQueryToParams, type WhtListQuery } from '../lib/wht-list-query'
import { useClientAuth } from '../lib/client-auth'

const QK = ['wht'] as const

/**
 * Paged certificate register.
 *
 * `params` is the already-serialized query, passed in so the cache key and the
 * request cannot disagree. keepPreviousData so paging does not collapse the
 * table into a skeleton on every page change.
 */
export function useWhtList(q: WhtListQuery, params: URLSearchParams) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'list', activeTenant, params.toString()],
    queryFn: (): Promise<WhtListResult> => fetchWhtList(activeTenant, q, params),
    placeholderData: keepPreviousData,
  })
}

/** Every certificate in a scope, unpaged — the print view. */
export function useWhtByScope(params: URLSearchParams, enabled = true) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'scope', activeTenant, params.toString()],
    enabled,
    queryFn: () => fetchWhtByScope(activeTenant, params),
  })
}

export function useWhtByIds(ids: string[]) {
  return useQuery({
    queryKey: [...QK, 'ids', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => fetchWhtByIds(ids),
  })
}

export function useSetWhtStatus() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: (v: { id: string; status: 'active' | 'done' }) => setWhtRecordStatus(activeTenant, v.id, v.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
    },
  })
}

export function useBulkSetWhtStatus() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => setWhtRecordStatus(activeTenant, id, 'done'))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
    },
  })
}

export { whtQueryToParams }
