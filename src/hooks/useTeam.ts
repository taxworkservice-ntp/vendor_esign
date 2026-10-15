import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { defaultPermissionsFor, type Permissions } from '../lib/permissions'
import { loadTenantUsers, saveTenantUsers } from '../lib/admin-mock'
import { useClientAuth } from '../lib/client-auth'

// Owner self-service: read members and edit permission flags. Identity
// (invite, roles, disable) stays operator-owned — there is no endpoint for it
// here by design, so the UI offers none either.

export interface TeamMember {
  id: string
  email: string
  role: string
  permissions: Permissions
  status: 'active' | 'disabled'
  mustChangePw: boolean
}

const QK = ['team'] as const

export function useTeamMembers() {
  const { activeTenant, ready, isOwner } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant],
    // The section renders for owners only; don't even fetch otherwise.
    enabled: ready && isOwner,
    queryFn: async (): Promise<TeamMember[]> => {
      if (hasServer) return (await apiGet<{ members: TeamMember[] }>('/api/client/team')).members
      const list = loadTenantUsers()[activeTenant] ?? []
      return list.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        permissions: u.permissions ?? defaultPermissionsFor(u.role),
        status: u.status,
        mustChangePw: u.mustChangePw,
      }))
    },
  })
}

export function useUpdateMemberPermissions() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (input: { userId: string; permissions: Permissions }): Promise<void> => {
      if (hasServer) {
        await apiSend(`/api/client/team/${encodeURIComponent(input.userId)}`, 'PATCH', {
          permissions: input.permissions,
        })
        return
      }
      const all = loadTenantUsers()
      const list = (all[activeTenant] ?? []).map((u) =>
        u.id === input.userId ? { ...u, permissions: input.permissions } : u,
      )
      saveTenantUsers({ ...all, [activeTenant]: list })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
