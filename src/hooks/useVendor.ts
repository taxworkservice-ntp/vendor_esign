import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentTransaction } from '../lib/types'
import { loadTxns, saveTxns } from '../lib/mock'
import { normalizeTaxId, taxIdHash } from '../lib/taxid'

export interface VendorCorrection {
  field: 'name' | 'address'
  from: string
  to: string
}

export interface VendorAuth {
  vendorName: string
  vendorAddress: string
  vendorIdLast4: string
  signaturePng: string // mock only — real backend stores a file, never localStorage
  verificationMethod: 'stub-deferred'
  consentVersion: 'v1'
  signedAt: string
  corrections: VendorCorrection[] // vendor edits to prefilled info, reported to client
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

// Tax ID gate (mock mirror of POST /api/vendor/:token/unlock).
// Legacy rows without taxIdHash skip the gate with a notice.
export const GATE_MAX_TRIES = 5
const gateFails = new Map<string, { n: number; until: number }>()

export function gateRemaining(token: string): number {
  const f = gateFails.get(token)
  if (!f) return GATE_MAX_TRIES
  if (Date.now() > f.until) {
    gateFails.delete(token)
    return GATE_MAX_TRIES
  }
  return Math.max(0, GATE_MAX_TRIES - f.n)
}

export function isGateUnlocked(token: string): boolean {
  try {
    return sessionStorage.getItem(`taxwork-gate-${token}`) === '1'
  } catch {
    return false
  }
}

export async function tryGateUnlock(
  token: string,
  txn: PaymentTransaction,
  idPlain: string,
): Promise<{ ok: boolean; remaining: number }> {
  if (!txn.taxIdHash) return { ok: true, remaining: GATE_MAX_TRIES } // legacy row
  const remaining = gateRemaining(token)
  if (remaining <= 0) return { ok: false, remaining: 0 }
  const match = (await taxIdHash(idPlain)) === txn.taxIdHash
  if (match) {
    try {
      sessionStorage.setItem(`taxwork-gate-${token}`, '1')
    } catch {
      /* private mode — gate re-asks on reload */
    }
    gateFails.delete(token)
    return { ok: true, remaining: GATE_MAX_TRIES }
  }
  const f = gateFails.get(token) ?? { n: 0, until: Date.now() + 10 * 60 * 1000 }
  f.n += 1
  gateFails.set(token, f)
  return { ok: false, remaining: Math.max(0, GATE_MAX_TRIES - f.n) }
}

export { normalizeTaxId }

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
      touch(id, (t) => {
        // Diff against client records — reported back on the detail page.
        const corrections: VendorCorrection[] = []
        if (auth.vendorName !== t.vendor.name)
          corrections.push({ field: 'name', from: t.vendor.name, to: auth.vendorName })
        if (auth.vendorAddress !== t.vendor.address)
          corrections.push({ field: 'address', from: t.vendor.address, to: auth.vendorAddress })
        const stored = readAuth()[id]
        if (stored) writeAuth({ ...readAuth(), [id]: { ...stored, corrections } })
        return {
          ...t,
          status: 'signed',
          inviteToken: undefined, // single-use: consumed on signing
          timeline: [
            ...t.timeline,
            { at: auth.signedAt, label: 'ผู้ขายเซ็นรับเงิน + มอบอำนาจ', detail: 'ยืนยันแบบ stub-deferred (LINE เปิดภายหลัง)' },
            ...(corrections.length
              ? [{
                  at: auth.signedAt,
                  label: 'ผู้ขายแก้ไขข้อมูล',
                  detail: corrections.map((x) => `${x.field === 'name' ? 'ชื่อ' : 'ที่อยู่'}: ${x.from} → ${x.to}`).join(' · '),
                }]
              : []),
          ],
        }
      })
      refresh()
    },
  }
}
