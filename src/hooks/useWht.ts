import { useQuery } from '@tanstack/react-query'
import { fetchWht, fetchWhtByIds } from '../lib/wht-source'
import { useClientAuth } from '../lib/client-auth'

export function useWht() {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: ['wht', activeTenant],
    queryFn: () => fetchWht(activeTenant),
  })
}

export function useWhtByIds(ids: string[]) {
  return useQuery({
    queryKey: ['wht', 'ids', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => fetchWhtByIds(ids),
  })
}
