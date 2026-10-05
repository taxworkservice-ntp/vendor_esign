import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LineItem, PaymentTransaction, TxnStatus } from '../lib/types'
import { loadTxns, saveTxns } from '../lib/mock'
import { normalizeLineItem } from '../lib/line-items'
import { normalizeTaxId, taxIdHash } from '../lib/taxid'
import { currentBeYear } from '../lib/settings'
import { nextReceiptNumber } from '../lib/receipt-number'
import { putSignature } from '../lib/sig-store'
import { hasServer } from '../lib/api-client'

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
const API = (import.meta.env.VITE_API_BASE ?? '') as string

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

// ── Server vendor view ──────────────────────────────────────────────────────
// The public vendor endpoint returns a masked, gate-aware projection of the
// transaction. Map it onto the shape the signing page already consumes.

interface ServerVendor {
  id: string
  tenantId: string
  clientCode?: string | null
  ref?: string
  description?: string
  note?: string
  lineItems?: unknown
  paymentType?: string
  grossAmount?: unknown
  whtRate?: unknown
  whtAmount?: unknown
  netAmount?: unknown
  transferDate?: string
  slipReference?: string
  status?: TxnStatus
  gated?: boolean
  idLast4?: string | null
  vendorPrefix?: string
  vendorName?: string
  vendorAddress?: string
  unlocked?: boolean
}

function maskFromLast4(last4: string | null | undefined): string {
  const d = String(last4 ?? '').replace(/\D/g, '').slice(-4)
  return d.length === 4 ? `x-xxxx-xxxxx-${d.slice(0, 2)}-${d.slice(2)}` : ''
}

async function fetchServerVendor(token: string): Promise<PaymentTransaction | undefined> {
  const r = await fetch(`${API}/api/vendor/${encodeURIComponent(token)}`, { credentials: 'include' })
  // 404 (unknown) and 410 (used/revoked/expired) are the "invalid link" states.
  if (r.status === 404 || r.status === 410) return undefined
  if (!r.ok) throw new Error('vendor-fetch-failed')
  const j = (await r.json()) as ServerVendor
  const items: LineItem[] = Array.isArray(j.lineItems)
    ? (j.lineItems as Record<string, unknown>[]).map((it) => normalizeLineItem(it as never))
    : []
  return {
    id: j.id,
    tenantId: j.tenantId,
    clientCode: j.clientCode ?? undefined,
    vendor: {
      id: '',
      vendorNo: 0,
      prefix: j.vendorPrefix ?? '',
      name: j.vendorName ?? '',
      address: j.vendorAddress ?? '',
      maskedId: maskFromLast4(j.idLast4),
    },
    paymentType: j.paymentType ?? '',
    description: j.description ?? '',
    note: j.note ?? '',
    lineItems: items,
    grossAmount: Number(j.grossAmount ?? 0),
    whtRate: Number(j.whtRate ?? 0),
    whtMode: 'deduct',
    whtAmount: Number(j.whtAmount ?? 0),
    netAmount: Number(j.netAmount ?? 0),
    transferDate: String(j.transferDate ?? ''),
    slipReference: j.slipReference ?? '',
    slipName: '',
    status: (j.status as TxnStatus) ?? 'sent',
    receiptNumber: undefined,
    createdAt: '',
    timeline: [],
    inviteToken: token,
    // The gate is enforced server-side; a truthy marker is all the page needs.
    taxIdHash: j.gated ? 'server' : undefined,
    taxIdLast4: j.idLast4 ?? undefined,
    checks: [],
  }
}

export function useVendorTxn(token?: string) {
  return useQuery({
    queryKey: [...QK, 'vendor', token],
    enabled: !!token,
    queryFn: async (): Promise<PaymentTransaction | undefined> =>
      hasServer
        ? fetchServerVendor(token!)
        : (loadTxns().find((t) => t.inviteToken === token) as PaymentTransaction | undefined),
  })
}

// Tax ID gate (server: POST /api/vendor/:token/unlock; mock: local hash compare).
// Legacy rows without a stored hash skip the gate with a notice.
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

  if (hasServer) {
    try {
      const r = await fetch(`${API}/api/vendor/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: idPlain }),
      })
      const j = (await r.json().catch(() => ({}))) as { remaining?: number }
      if (r.ok) {
        try {
          sessionStorage.setItem(`taxwork-gate-${token}`, '1')
        } catch {
          /* private mode — gate re-asks on reload */
        }
        return { ok: true, remaining: GATE_MAX_TRIES }
      }
      return { ok: false, remaining: Number(j?.remaining ?? 0) }
    } catch {
      return { ok: false, remaining: GATE_MAX_TRIES }
    }
  }

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
      // Server mode: opening already stamps opened_at in GET /api/vendor/:token.
      if (hasServer) return
      touch(id, (t) =>
        t.status === 'sent'
          ? { ...t, status: 'opened', timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ผู้ขายเปิดลิงก์' }] }
          : t,
      )
      refresh()
    },
    async submit(id: string, auth: VendorAuth, token?: string): Promise<{ ok: boolean; error?: string }> {
      if (hasServer) {
        if (!token) return { ok: false, error: 'invalid-link' }
        const r = await fetch(`${API}/api/vendor/${encodeURIComponent(token)}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorPrefix: auth.vendorPrefix,
            vendorName: auth.vendorName,
            vendorAddress: auth.vendorAddress,
            idLast4: auth.vendorIdLast4,
            signaturePng: auth.signaturePng,
            consentVersion: 'v1',
          }),
        })
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null
          return { ok: false, error: j?.error ?? 'sign-failed' }
        }
        return { ok: true }
      }

      // Mock mode: local store (kept for `npm run dev` without an API).
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
      return { ok: true }
    },
  }
}
