import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { validateSettings, type TenantSettings } from '../lib/settings'
import { getSettingsSource } from '../lib/settings-source'
import { useClientAuth } from '../lib/client-auth'

const QK = ['settings'] as const

export function useSettings() {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant],
    queryFn: async (): Promise<TenantSettings> => getSettingsSource().get(activeTenant),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (s: TenantSettings) => {
      const err = validateSettings(s)
      if (err) throw new Error(err)
      await getSettingsSource().save(activeTenant, s)
      return s
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
