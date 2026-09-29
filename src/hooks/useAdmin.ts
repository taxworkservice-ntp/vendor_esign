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

const API = ((import.meta.env.VITE_ADMIN_API_BASE ?? '') || (import.meta.env.VITE_API_BASE ?? '')) as string
const QK = ['admin', 'tenants'] as const

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...init })
  const j = (await r.json().catch(() => null)) as T & { error?: string }
  if (!r.ok) throw new Error((j as { error?: string })?.error ?? 'request-failed')
  return j as T
}

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

export function useUserActions(tenantId?: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: QK })
  return {
    async reset(userId: string): Promise<string> {
      if (API) {
        const j = await api<{ ok: boolean; tempPassword: string }>(`/api/admin/users/${userId}/reset`, { method: 'POST' })
        refresh()
        return j.tempPassword
      }
      const pw = mockTempPassword()
      refresh()
      return pw
    },
    async disable(userId: string) {
      if (API) {
        await api(`/api/admin/users/${userId}/disable`, { method: 'POST' })
        refresh()
        return
      }
      const all = loadTenantUsers()
      const list = (all[tenantId ?? ''] ?? []).map((u) => (u.id === userId ? { ...u, status: 'disabled' as const } : u))
      saveTenantUsers({ ...all, [tenantId ?? '']: list })
      refresh()
    },
  }
}
