import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useClientAuth } from '../lib/client-auth'
import {
  createVendorInvite,
  listVendorInvites,
  resendVendorInvite,
  reviewVendorInvite,
} from '../lib/vendor-invite-source'

const QK = ['vendor-invites'] as const

export function useVendorInvites() {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant],
    queryFn: () => listVendorInvites(activeTenant),
  })
}

export function useCreateVendorInvite() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: (label?: string) => createVendorInvite(activeTenant, label),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useReviewVendorInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; action: 'approve' | 'reject' | 'request-changes'; note?: string }) =>
      reviewVendorInvite(v.id, v.action, v.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
      qc.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}

export function useResendVendorInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resendVendorInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
