import { sql } from '../../src/server/db'

// Global (cross-tenant) provider settings: announcement banner, maintenance
// mode, feature flags. Stored one row per key in `platform_settings`.

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
export interface PlatformSettings {
  announcement: Announcement
  maintenance: Maintenance
  flags: Record<string, boolean>
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  announcement: { active: false, level: 'info', message: '' },
  maintenance: { mode: 'off', message: '' },
  flags: {},
}

// Settings are read on every guarded client request, so cache briefly and
// invalidate on write. A few seconds of propagation is fine for a banner.
let cache: { at: number; value: PlatformSettings } | null = null
const CACHE_MS = 10_000

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const db = sql()
  const rows = (await db`select key, value from platform_settings`) as unknown as { key: string; value: unknown }[]
  const out: PlatformSettings = {
    announcement: { ...DEFAULT_PLATFORM_SETTINGS.announcement },
    maintenance: { ...DEFAULT_PLATFORM_SETTINGS.maintenance },
    flags: {},
  }
  for (const r of rows) {
    if (!r.value || typeof r.value !== 'object') continue
    if (r.key === 'announcement') out.announcement = { ...out.announcement, ...(r.value as object) }
    else if (r.key === 'maintenance') out.maintenance = { ...out.maintenance, ...(r.value as object) }
    else if (r.key === 'flags') out.flags = { ...out.flags, ...(r.value as Record<string, boolean>) }
  }
  return out
}

export async function getPlatformSettingsCached(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  const value = await getPlatformSettings()
  cache = { at: Date.now(), value }
  return value
}

export async function savePlatformSetting(key: string, value: unknown, actor: string): Promise<void> {
  const db = sql()
  await db`insert into platform_settings (key, value, updated_by, updated_at)
    values (${key}, ${JSON.stringify(value)}::jsonb, ${actor}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`
  cache = null
}
