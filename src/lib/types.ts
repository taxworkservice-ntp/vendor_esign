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
  phone?: string
  email?: string
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
  /** Catalog item this line was picked from (absent on legacy free-text lines). */
  itemId?: string
  /** Ticked subset of the item's defined sub-notes (snapshot at save time). */
  subItems?: string[]
}

/** Vendor-portal only: everything needed to rebuild the receipt sheet on a
 *  return visit (the server returns it once the vendor has signed). */
export interface VendorReceiptInfo {
  number?: string | null
  verificationCode?: string | null
  issueDate?: string | null
  signedAt?: string | null
  sigMethod?: string | null
  authRef?: string | null
  consentVersion?: string | null
  hasSignature: boolean
  isVoid?: boolean
  voidReason?: string | null
  client: { displayName: string; address: string; taxId: string }
  vendor: {
    prefix?: string
    name: string
    address: string
    phone?: string | null
    email?: string | null
    taxId?: string | null
    maskedId: string
  }
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
  /** Whether a slip file has been stored (drives the detail preview). */
  hasSlip?: boolean
  status: TxnStatus
  receiptNumber?: string // assigned once: RCT-{VENDORNO}-{BE_YEAR}-{SEQ}
  verificationCode?: string // printed on the issued receipt; drives the /verify page
  receiptIssueDate?: string // the real issuance date (the document date follows transferDate)
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
  /** Client workspace code — shown in the vendor consent text (server mode). */
  clientCode?: string
  /** Client legal name — used in the vendor consent statement. */
  clientName?: string
  /** Server path for the client logo shown in the vendor link header. */
  logoUrl?: string | null
  /** Human transaction reference (e.g. TX-1050); equals `id` in the mock. */
  ref?: string
  /** Consent wording (with {{placeholders}}) + its version, from tenant settings. */
  consentTemplate?: string
  consentVersion?: string
  /** Vendor-portal only: the signed receipt payload for a return visit. */
  vendorReceipt?: VendorReceiptInfo
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
  /** The slip file itself (image downscaled to JPEG, or a PDF), uploaded with
   *  the transaction. Optional — it can be attached later. */
  slipFile?: { dataUrl: string; name: string }
  vendorTaxId: string // plaintext in transit only — hashed before storage
}
