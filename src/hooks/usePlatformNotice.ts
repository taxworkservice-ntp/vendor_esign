import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '../lib/api-base'

// Public platform notice (announcement + maintenance) shown in the client shell.
// Reads GET /api/announcement (no auth). In mock mode there is no server, so the
// consumer falls back to the defaults.

export type AnnouncementLevel = 'info' | 'warning' | 'critical'
export interface Announcement {
  active: boolean
  level: AnnouncementLevel
  message: string
}
export type MaintenanceMode = 'off' | 'read_only' | 'full'
export interface Maintenance {
  mode: MaintenanceMode
  message: string
}
export interface PlatformNotice {
  announcement: Announcement
  maintenance: Maintenance
  /** Curated client-facing feature flags. */
  flags: { whtGrossUp: boolean }
}

export const DEFAULT_NOTICE: PlatformNotice = {
  announcement: { active: false, level: 'info', message: '' },
  maintenance: { mode: 'off', message: '' },
  flags: { whtGrossUp: false },
}

const API = API_BASE

export function usePlatformNotice(): PlatformNotice {
  const q = useQuery({
    queryKey: ['platform-notice'],
    enabled: !!API,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformNotice> => {
      const r = await fetch(`${API}/api/announcement`, { credentials: 'include' })
      if (!r.ok) throw new Error('notice-failed')
      const j = (await r.json()) as Partial<PlatformNotice>
      return {
        announcement: { ...DEFAULT_NOTICE.announcement, ...j.announcement },
        maintenance: { ...DEFAULT_NOTICE.maintenance, ...j.maintenance },
        flags: { ...DEFAULT_NOTICE.flags, ...j.flags },
      }
    },
  })
  return q.data ?? DEFAULT_NOTICE
}
