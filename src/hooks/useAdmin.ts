import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  loadTenantUsers,
  loadTenants,
  mockTempPassword,
  saveTenantUsers,
  saveTenants,
  type AdminTenant,
  type AdminUser,
} from '../lib/admin-mock'
import type { AnnouncementLevel, MaintenanceMode, PlatformNotice } from './usePlatformNotice'

const API = ((import.meta.env.VITE_ADMIN_API_BASE ?? '') || (import.meta.env.VITE_API_BASE ?? '')) as string
const QK = ['admin', 'tenants'] as const

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...init })
  const j = (await r.json().catch(() => null)) as T & { error?: string }
  if (!r.ok) throw new Error((j as { error?: string })?.error ?? 'request-failed')
  return j as T
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdminOverview {
  tenants: { total: number; active: number; suspended: number }
  users: { total: number; active: number }
  counts: { transactions: number; receipts: number; wht: number; signings: number }
  platform: PlatformNotice
  recentTenants: { id: string; name: string; clientCode: string; status: string; createdAt: string }[]
  recentAudit: { id: string; tenantId: string; entityType: string; eventType: string; actor: string | null; createdAt: string }[]
}

export interface AdminDirectoryUser {
  id: string
  email: string
  status: 'active' | 'disabled'
  mustChangePw: boolean
  memberships: { tenantId: string; role: string; status: string }[]
  createdAt: string
}

export interface AuditEvent {
  id: string
  tenantId: string
  entityType: string
  entityId: string
  eventType: string
  actor: string | null
  metadata: unknown
  ip: string | null
  createdAt: string
}

export interface AdminSession {
  id: string
  createdAt: string
  expiresAt: string
  ip: string | null
  userAgent: string | null
}

export interface PlatformSettingsAdmin {
  announcement: { active: boolean; level: AnnouncementLevel; message: string }
  maintenance: { mode: MaintenanceMode; message: string }
  flags: Record<string, boolean>
}

const DEFAULT_SETTINGS: PlatformSettingsAdmin = {
  announcement: { active: false, level: 'info', message: '' },
  maintenance: { mode: 'off', message: '' },
  flags: {},
}

// ── Overview ─────────────────────────────────────────────────────────────────
export function useAdminOverview() {
  return useQuery({
    queryKey: [...QK, 'overview'],
    queryFn: async (): Promise<AdminOverview> => {
      if (API) return api<AdminOverview>('/api/admin/overview')
      const tenants = loadTenants()
      const users = Object.values(loadTenantUsers()).flat()
      return {
        tenants: {
          total: tenants.length,
          active: tenants.filter((t) => t.status === 'active').length,
          suspended: tenants.filter((t) => t.status === 'suspended').length,
        },
        users: { total: users.length, active: users.filter((u) => u.status === 'active').length },
        counts: { transactions: 0, receipts: 0, wht: 0, signings: 0 },
        platform: { announcement: { active: false, level: 'info', message: '' }, maintenance: { mode: 'off', message: '' } },
        recentTenants: tenants.slice(0, 5).map((t) => ({
          id: t.id, name: t.displayName, clientCode: t.clientCode, status: t.status, createdAt: new Date().toISOString(),
        })),
        recentAudit: [],
      }
    },
  })
}

// ── Tenants ──────────────────────────────────────────────────────────────────
export function useAdminTenants(q = '', status = 'all') {
  return useQuery({
    queryKey: [...QK, q, status],
    queryFn: async (): Promise<AdminTenant[]> => {
      const list = API
        ? (await api<{ tenants: AdminTenant[] }>('/api/admin/tenants')).tenants
        : loadTenants()
      return list.filter(
        (t) =>
          (status === 'all' || t.status === status) &&
          (!q || t.id.toLowerCase().includes(q.toLowerCase()) || t.displayName.toLowerCase().includes(q.toLowerCase())),
      )
    },
  })
}

export function useAdminTenant(id?: string) {
  return useQuery({
    queryKey: [...QK, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<AdminTenant | undefined> => {
      if (API) return api<AdminTenant>(`/api/admin/tenants/${id}`)
      return loadTenants().find((t) => t.id === id)
    },
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      displayName: string
      address: string
      taxId: string
      contactName: string
      beYear: number
      startNumber: number
    }): Promise<{ id: string }> => {
      if (API) {
        return api<{ ok: boolean; id: string }>('/api/admin/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, clientCode: input.id }),
        })
      }
      const all = loadTenants()
      const code = input.id.trim().toUpperCase()
      if (!code || all.some((t) => t.id === code)) throw new Error('รหัสลูกค้านี้มีอยู่แล้ว')
      const row: AdminTenant = {
        id: code, clientCode: code, status: 'active',
        txns: 0, receipts: 0, users: 0,
        displayName: input.displayName, address: input.address, taxId: input.taxId,
        contactName: input.contactName, beYear: input.beYear, startNumber: input.startNumber,
      }
      saveTenants([row, ...all])
      return { id: code }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useUpdateTenant(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<AdminTenant, 'displayName' | 'address' | 'contactName' | 'status'>>) => {
      if (API && id) {
        return api(`/api/admin/tenants/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      }
      saveTenants(loadTenants().map((t) => (t.id === id ? { ...t, ...patch } : t)))
      return { ok: true }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (API) return api(`/api/admin/tenants/${id}`, { method: 'DELETE' })
      saveTenants(loadTenants().filter((t) => t.id !== id))
      return { ok: true }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

// ── Tenant users ─────────────────────────────────────────────────────────────
export function useTenantUsers(tenantId?: string) {
  return useQuery({
    queryKey: [...QK, tenantId, 'users'],
    enabled: !!tenantId,
    queryFn: async (): Promise<AdminUser[]> => {
      if (API && tenantId) return (await api<{ users: AdminUser[] }>(`/api/admin/tenants/${tenantId}/users`)).users
      return loadTenantUsers()[tenantId ?? ''] ?? []
    },
  })
}

export function useCreateUser(tenantId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: 'owner' | 'manager' | 'officer' }): Promise<{ tempPassword: string }> => {
      if (API && tenantId) {
        return api<{ ok: boolean; tempPassword: string }>(`/api/admin/tenants/${tenantId}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      }
      const pw = mockTempPassword()
      const all = loadTenantUsers()
      const list = all[tenantId ?? ''] ?? []
      const email = input.email.trim().toLowerCase()
      if (list.some((u) => u.email === email)) throw new Error('อีเมลนี้มีอยู่แล้วในลูกค้านี้')
      const row: AdminUser = { id: `u-${Date.now()}`, email, role: input.role, status: 'active', mustChangePw: true }
      const next = { ...all, [tenantId ?? '']: [...list, row] }
      saveTenantUsers(next)
      saveTenants(loadTenants().map((t) => (t.id === tenantId ? { ...t, users: (next[tenantId ?? ''] ?? []).length } : t)))
      return { tempPassword: pw }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

// ── All users directory ──────────────────────────────────────────────────────
export function useAllAdminUsers(q = '') {
  return useQuery({
    queryKey: [...QK, 'users', q],
    queryFn: async (): Promise<AdminDirectoryUser[]> => {
      const list = API
        ? (await api<{ users: AdminDirectoryUser[] }>('/api/admin/users')).users
        : Object.values(loadTenantUsers()).flat().map((u) => ({
            id: u.id, email: u.email, status: u.status as 'active' | 'disabled', mustChangePw: u.mustChangePw,
            memberships: [], createdAt: new Date().toISOString(),
          }))
      const needle = q.trim().toLowerCase()
      return needle
        ? list.filter((u) => u.email.toLowerCase().includes(needle) || u.memberships.some((m) => m.tenantId.toLowerCase().includes(needle)))
        : list
    },
  })
}

// ── User actions ─────────────────────────────────────────────────────────────
export function useUserActions(tenantId?: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: QK })
  const post = async (userId: string, action: string) => {
    if (API) return api(`/api/admin/users/${userId}/${action}`, { method: 'POST' })
    return { ok: true }
  }
  return {
    async reset(userId: string): Promise<string> {
      if (API) {
        const j = await api<{ ok: boolean; tempPassword: string }>(`/api/admin/users/${userId}/reset`, { method: 'POST' })
        refresh()
        return j.tempPassword
      }
      refresh()
      return mockTempPassword()
    },
    async disable(userId: string) {
      await post(userId, 'disable')
      if (!API) {
        const all = loadTenantUsers()
        saveTenantUsers({ ...all, [tenantId ?? '']: (all[tenantId ?? ''] ?? []).map((u) => (u.id === userId ? { ...u, status: 'disabled' as const } : u)) })
      }
      refresh()
    },
    async enable(userId: string) {
      await post(userId, 'enable')
      refresh()
    },
    async forceChange(userId: string) {
      await post(userId, 'force-change')
      refresh()
    },
    async revokeSessions(userId: string) {
      await post(userId, 'revoke-sessions')
      refresh()
    },
    async update(userId: string, patch: { role?: string; tenantId?: string }) {
      if (API) {
        await api(`/api/admin/users/${userId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        })
      }
      refresh()
    },
  }
}

// ── Audit log ────────────────────────────────────────────────────────────────
export function useAuditLog(filters: {
  q?: string
  tenant?: string
  event?: string
  limit?: number
  offset?: number
  sort?: string
  order?: 'asc' | 'desc'
}) {
  const { q = '', tenant = '', event = '', limit = 50, offset = 0, sort = '', order = 'desc' } = filters
  return useQuery({
    queryKey: [...QK, 'audit', q, tenant, event, limit, offset, sort, order],
    queryFn: async (): Promise<{ events: AuditEvent[]; total: number }> => {
      if (!API) return { events: [], total: 0 }
      const p = new URLSearchParams({ q, tenant, event, limit: String(limit), offset: String(offset), sort, order })
      return api<{ events: AuditEvent[]; total: number }>(`/api/admin/audit?${p.toString()}`)
    },
  })
}

// ── Platform settings ────────────────────────────────────────────────────────
export function usePlatformSettingsAdmin() {
  return useQuery({
    queryKey: [...QK, 'settings'],
    queryFn: async (): Promise<PlatformSettingsAdmin> => {
      if (!API) return DEFAULT_SETTINGS
      return api<PlatformSettingsAdmin>('/api/admin/settings')
    },
  })
}

export function useSavePlatformSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<PlatformSettingsAdmin>): Promise<PlatformSettingsAdmin> => {
      if (!API) return { ...DEFAULT_SETTINGS, ...patch }
      return api<PlatformSettingsAdmin>('/api/admin/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
    },
    onSuccess: (data) => {
      qc.setQueryData([...QK, 'settings'], data)
      qc.invalidateQueries({ queryKey: [...QK, 'overview'] })
    },
  })
}

// ── Operator sessions ────────────────────────────────────────────────────────
export function useAdminSessions() {
  return useQuery({
    queryKey: [...QK, 'sessions'],
    queryFn: async (): Promise<AdminSession[]> => {
      if (!API) return []
      return (await api<{ sessions: AdminSession[] }>('/api/admin/sessions')).sessions
    },
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!API) return { ok: true }
      return api(`/api/admin/sessions/${id}/revoke`, { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...QK, 'sessions'] }),
  })
}

// ── Impersonation ────────────────────────────────────────────────────────────
export function useImpersonate() {
  return useMutation({
    mutationFn: async ({ tenantId, mode }: { tenantId: string; mode: 'read' | 'write' }) => {
      return api<{ ok: boolean; tenantId: string; mode: string }>('/api/admin/impersonate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, mode }),
      })
    },
  })
}
