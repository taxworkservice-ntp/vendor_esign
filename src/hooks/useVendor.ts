import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentTransaction } from '../lib/types'
import { loadTxns, saveTxns } from '../lib/mock'

export interface VendorAuth {
  vendorName: string
  vendorAddress: string
  vendorIdLast4: string
  signaturePng: string // mock only — real backend stores a file, never localStorage
  verificationMethod: 'stub-deferred'
  consentVersion: 'v1'
  signedAt: string
}

const AUTH_KEY = 'taxwork-pilot-auth-v1'
const QK = ['transactions'] as const

// In-memory signature store (module scope). Real backend: private Storage bucket.
const signatures = new Map<string, string>()

export function getSignature(txnId: string): string | undefined {
  return signatures.get(txnId)
}

type StoredAuth = Omit<VendorAuth, 'signaturePng'>

function readAuth(): Record<string, StoredAuth> {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writeAuth(all: Record<string, StoredAuth>) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...all }))
  } catch {
    /* quota — signatures stay in memory only */
  }
}
function withoutPng(a: VendorAuth): StoredAuth {
  const { signaturePng: _drop, ...rest } = a
  return rest
}

export function getAuth(txnId: string): VendorAuth | undefined {
  const meta = readAuth()[txnId]
  const png = signatures.get(txnId)
  if (!meta || !png) return undefined
  return { ...meta, signaturePng: png }
}

export function useVendorTxn(token?: string) {
  return useQuery({
    queryKey: [...QK, 'vendor', token],
    enabled: !!token,
    queryFn: async () =>
      loadTxns().find((t) => t.inviteToken === token) as PaymentTransaction | undefined,
  })
}

function touch(id: string, fn: (t: PaymentTransaction) => PaymentTransaction) {
  const all = loadTxns()
  saveTxns(all.map((t) => (t.id === id ? fn(t) : t)))
}

export function useVendorActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: QK })
  return {
    markOpened(id: string) {
      touch(id, (t) =>
        t.status === 'sent'
          ? { ...t, status: 'opened', timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ผู้ขายเปิดลิงก์' }] }
          : t,
      )
      refresh()
    },
    submit(id: string, auth: VendorAuth) {
      signatures.set(id, auth.signaturePng)
      writeAuth({ ...readAuth(), [id]: withoutPng(auth) })
      touch(id, (t) => ({
        ...t,
        status: 'signed',
        inviteToken: undefined, // single-use: consumed on signing
        timeline: [
          ...t.timeline,
          { at: auth.signedAt, label: 'ผู้ขายเซ็นรับเงิน + มอบอำนาจ', detail: 'ยืนยันแบบ stub-deferred (LINE เปิดภายหลัง)' },
        ],
      }))
      refresh()
    },
  }
}
