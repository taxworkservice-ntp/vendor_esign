import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentTransaction } from '../lib/types'
import { loadTxns, saveTxns } from '../lib/mock'
import { normalizeTaxId, taxIdHash } from '../lib/taxid'
import { currentBeYear } from '../lib/settings'
import { nextReceiptNumber } from '../lib/receipt-number'
import { putSignature } from '../lib/sig-store'

export interface VendorCorrection {
  field: 'prefix' | 'name' | 'address'
  from: string
  to: string
}

/** The non-image half of a vendor authorization — safe for localStorage. */
export interface VendorAuthMeta {
  vendorPrefix: string
  vendorName: string
  vendorAddress: string
  vendorIdLast4: string
  verificationMethod: 'stub-deferred'
  consentVersion: 'v1'
  signedAt: string
  corrections: VendorCorrection[] // vendor edits to prefilled info, reported to client
}

export interface VendorAuth extends VendorAuthMeta {
  signaturePng: string
}

const AUTH_KEY = 'taxwork-pilot-auth-v1'
const QK = ['transactions'] as const

type StoredAuth = VendorAuthMeta

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
    /* quota */
  }
}

/**
 * The authorization metadata, without the signature image.
 *
 * The PNG lives in IndexedDB (lib/sig-store.ts) rather than here: a base64
 * image in localStorage is large and opaque to quota accounting. It also used
 * to live in a module-scope Map, which meant the accountant's tab — a
 * different JS runtime — could never see it and the receipt rendered with an
 * empty signature box.
 */
export function getAuthMeta(txnId: string): VendorAuthMeta | undefined {
  return readAuth()[txnId]
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

function touch(id: string, fn: (t: PaymentTransaction, all: PaymentTransaction[]) => PaymentTransaction) {
  const all = loadTxns()
  saveTxns(all.map((t) => (t.id === id ? fn(t, all) : t)))
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
      // Fire-and-forget: the PNG is already in hand, and blocking the status
      // flip on an IndexedDB write would only add latency to the vendor.
      void putSignature(id, auth.signaturePng)
      writeAuth({ ...readAuth(), [id]: auth })
      touch(id, (t, all) => {
        // Assign the receipt number as soon as the vendor signs, so the receipt
        // (and the vendor's copy) always shows a number. Finalization keeps it.
        const receiptNumber =
          t.receiptNumber ??
          nextReceiptNumber(
            t.vendor.vendorNo ?? 0,
            currentBeYear(),
            all.filter((x) => x.tenantId === t.tenantId && x.id !== t.id).map((x) => x.receiptNumber),
          )
        // Diff against client records — reported back on the detail page.
        const corrections: VendorCorrection[] = []
        if (auth.vendorPrefix !== (t.vendor.prefix ?? ''))
          corrections.push({ field: 'prefix', from: t.vendor.prefix ?? '', to: auth.vendorPrefix })
        if (auth.vendorName !== t.vendor.name)
          corrections.push({ field: 'name', from: t.vendor.name, to: auth.vendorName })
        if (auth.vendorAddress !== t.vendor.address)
          corrections.push({ field: 'address', from: t.vendor.address, to: auth.vendorAddress })
        const stored = readAuth()[id]
        if (stored) writeAuth({ ...readAuth(), [id]: { ...stored, corrections } })
        return {
          ...t,
          status: 'signed',
          receiptNumber,
          inviteToken: undefined, // single-use: consumed on signing
          timeline: [
            ...t.timeline,
            { at: auth.signedAt, label: 'ผู้ขายลงนามรับเงินและมอบอำนาจ', detail: 'ยืนยันด้วยลายเซ็น (การยืนยันผ่าน LINE จะเปิดใช้งานในภายหลัง)' },
            ...(corrections.length
              ? [{
                  at: auth.signedAt,
                  label: 'ผู้ขายแก้ไขข้อมูล',
                  detail: corrections.map((x) => `${x.field === 'name' ? 'ชื่อ' : x.field === 'address' ? 'ที่อยู่' : 'คำนำหน้า'}: ${x.from || '—'} → ${x.to || '—'}`).join(' · '),
                }]
              : []),
          ],
        }
      })
      refresh()
    },
  }
}
