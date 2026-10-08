import { loadSettings, saveSettings, type TenantSettings } from './settings'
import { API_BASE } from './api-base'

// Port/adapter mirroring vendor-memory-source: mock (localStorage per tenant) now,
// server endpoint when VITE_API_BASE is set.
const API = API_BASE

export interface SettingsSource {
  get(tenantId: string): Promise<TenantSettings>
  save(tenantId: string, s: TenantSettings): Promise<void>
}

export function getSettingsSource(): SettingsSource {
  return API ? httpSource(API) : mockSource()
}

function mockSource(): SettingsSource {
  return {
    async get(tenantId) {
      return loadSettings(tenantId)
    },
    async save(tenantId, s) {
      saveSettings(tenantId, s)
    },
  }
}

function httpSource(base: string): SettingsSource {
  return {
    async get(tenantId) {
      const r = await fetch(`${base}/api/settings`, { credentials: 'include' })
      const j = (await r.json().catch(() => null)) as (TenantSettings & { error?: string }) | null
      if (!r.ok) throw new Error(j?.error ?? 'request-failed')
      return j as TenantSettings
    },
    async save(_tenantId, s) {
      const r = await fetch(`${base}/api/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? 'request-failed')
      }
    },
  }
}
