export type TxnStatus =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'signed'
  | 'issued'
  | 'expired'
  | 'cancelled'
  | 'void'

export interface Vendor {
  id: string
  name: string
  address: string
  maskedId: string
}

export interface PaymentTransaction {
  id: string
  vendor: Vendor
  paymentType: string
  description: string
  grossAmount: number
  whtRate: number
  whtAmount: number
  netAmount: number
  transferDate: string
  slipReference: string
  slipName: string
  status: TxnStatus
  createdAt: string
  timeline: { at: string; label: string; detail?: string }[]
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
  description: string
  grossAmount: number
  whtRate: number
  transferDate: string
  slipReference: string
  slipName: string
  vendorTaxId: string // plaintext in transit only — hashed before storage
}
