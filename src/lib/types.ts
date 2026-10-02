export type TxnStatus =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'signed'
  | 'issued'
  | 'expired'
  | 'cancelled'
  | 'void'

export type WhtMode = 'deduct' | 'grossup'

export interface Vendor {
  id: string
  vendorNo?: number // per-tenant vendor number used as a receipt-number segment
  prefix?: string // คำนำหน้าชื่อ (นาย/นาง/นางสาว) — optional; absent for entities/legacy
  name: string
  address: string
  maskedId: string
  // Full tax ID for local testing display; production never stores plaintext.
  taxId?: string
}

// A receipt line. `amount` is the authoritative line total
// (= quantity × unitPrice − discount). Legacy rows may only carry `amount`.
export interface LineItem {
  description: string
  unit?: string
  quantity?: number
  unitPrice?: number
  discount?: number // baht
  amount: number
}

export interface PaymentTransaction {
  id: string
  tenantId: string
  vendor: Vendor
  paymentType: string
  description: string // derived summary (first item + “และอื่น ๆ”) for lists/search
  note?: string // optional free-text header above the items
  lineItems: LineItem[]
  grossAmount: number
  whtRate: number
  whtMode: WhtMode
  whtAmount: number
  netAmount: number
  transferDate: string
  slipReference: string
  slipName: string
  status: TxnStatus
  receiptNumber?: string // assigned once: RCT-{VENDORNO}-{BE_YEAR}-{SEQ}
  createdAt: string
  timeline: { at: string; label: string; detail?: string }[]
  // Invite lifecycle timestamps. Populated identically by the mock (from the
  // timeline) and by the server (from vendor_requests) so aging logic has one
  // source of truth instead of parsing Thai labels.
  sentAt?: string
  openedAt?: string
  expiresAt?: string
  voidReason?: string
  inviteToken?: string
  // Tax ID gate: hash-only. Full ID is never stored (mock or server).
  taxIdHash?: string
  taxIdLast4?: string
  checks: { key: string; label: string; state: 'pass' | 'warn' | 'fail' }[]
}

export interface CreateTxnInput {
  vendorId: string
  paymentType: string
  note: string
  lineItems: LineItem[]
  whtRate: number
  whtMode: WhtMode
  /** Continuous-contract escape: withhold even when gross < whtMinThreshold. */
  forceWht?: boolean
  transferDate: string
  slipReference: string
  slipName: string
  vendorTaxId: string // plaintext in transit only — hashed before storage
}
