// Vendor self-onboarding via an invite link.
//
// The client sends a link; the vendor fills in their own identity, tax ID and
// bank details and uploads documents; the client reviews and approves, which
// creates a normal vendor record. This removes the manual LINE-chat intake.
//
// Both executors (server routes and the mock store) share these shapes.

export type VendorInviteStatus =
  | 'invited'
  | 'opened'
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'expired'

/** What the vendor submits. */
export interface VendorInviteDraft {
  prefix: string
  name: string
  address: string
  phone?: string
  email?: string
  lineUserId?: string
  /** 13-digit national ID / tax ID (validated with a checksum). */
  taxId: string
  bankName: string
  bankAccount: string
  accountHolder: string
}

export interface VendorInvite {
  id: string
  tenantId: string
  status: VendorInviteStatus
  /** Raw token — only ever present in the create/resend response for the client. */
  token?: string
  /** Where the invite was sent, for the client's reference. */
  label?: string
  createdAt: string
  expiresAt: string
  openedAt?: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  /** Submitted data (present once submitted). */
  draft?: VendorInviteDraft
  /** Document file names (both required). */
  idDocName?: string
  bankDocName?: string
  /** Document bytes as data URLs — mock path only; the server stores to R2. */
  idDocData?: string
  bankDocData?: string
  /** Set when the client approves — the created vendor. */
  vendorId?: string
  /** Possible existing vendor with the same tax ID (client-visible warning). */
  duplicateOf?: string
  /** Whether the submitted account-holder name matches the vendor name. */
  bankNameMatch?: boolean
  /** Consent version the vendor accepted. */
  consentVersion?: string
  consentedAt?: string
}

/** A short-lived public view of an invite for the onboard page. */
export interface VendorInvitePublic {
  status: VendorInviteStatus
  /** Client display name, so the vendor knows who is asking. */
  clientName?: string
  /** Prefill when resuming a partially/incorrectly completed form. */
  draft?: VendorInviteDraft
  reviewNote?: string
  expiresAt: string
}

export const INVITE_TTL_DAYS = 30
export const CONSENT_VERSION = 'vendor-onboard-v1'

export const INVITE_STATUS_LABEL: Record<VendorInviteStatus, string> = {
  invited: 'ส่งลิงก์แล้ว — รอผู้ขายกรอก',
  opened: 'ผู้ขายเปิดลิงก์แล้ว',
  submitted: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  changes_requested: 'ขอให้แก้ไข',
  rejected: 'ปฏิเสธ',
  expired: 'หมดอายุ',
}

/** Labels for the documents the vendor must provide. */
export const REQUIRED_DOCS = [
  { key: 'idDoc' as const, label: 'รูปบัตรประชาชน (หน้าบัตร)', hint: 'ถ่ายให้เห็นเลขชัดเจน' },
  { key: 'bankDoc' as const, label: 'หน้าสมุดบัญชีธนาคาร', hint: 'หน้าแรกที่แสดงชื่อบัญชีและเลขบัญชี' },
]
