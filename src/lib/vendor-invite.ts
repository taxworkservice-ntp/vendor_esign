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
  | 'cancelled'

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
  cancelled: 'ยกเลิกโดยลูกค้า',
}

/** Labels for the documents the vendor must provide. */
export const REQUIRED_DOCS = [
  { key: 'idDoc' as const, label: 'รูปบัตรประชาชน (หน้าบัตร)', hint: 'ถ่ายให้เห็นเลขชัดเจน' },
  { key: 'bankDoc' as const, label: 'หน้าสมุดบัญชีธนาคาร', hint: 'หน้าแรกที่แสดงชื่อบัญชีและเลขบัญชี' },
]

// How long a live invite may sit without the vendor acting before it is flagged
// for follow-up on the register.
export const INVITE_FOLLOWUP_DAYS = {
  invited: 7, // link sent, never opened
  opened: 3, // opened, never submitted
  changes_requested: 3, // asked to fix, not resubmitted
} as const

export interface InviteAttention {
  level: 'ok' | 'followup'
  /** Days since the relevant milestone (sent / opened / changes-requested). */
  ageDays: number
  reason?: string
}

const DAY_MS = 86_400_000

function daysBetween(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))
}

/**
 * Whether a live invite needs the client to chase the vendor, based on how long
 * it has sat at each stage. Closed states (approved/rejected/expired/cancelled)
 * are never flagged.
 */
export function inviteAttention(inv: VendorInvite, now = Date.now()): InviteAttention {
  if (inv.status === 'invited') {
    const ageDays = daysBetween(inv.createdAt, now)
    return ageDays >= INVITE_FOLLOWUP_DAYS.invited
      ? { level: 'followup', ageDays, reason: 'ยังไม่เปิดลิงก์' }
      : { level: 'ok', ageDays }
  }
  if (inv.status === 'opened') {
    const ageDays = daysBetween(inv.openedAt ?? inv.createdAt, now)
    return ageDays >= INVITE_FOLLOWUP_DAYS.opened
      ? { level: 'followup', ageDays, reason: 'เปิดแล้วยังไม่ส่งข้อมูล' }
      : { level: 'ok', ageDays }
  }
  if (inv.status === 'changes_requested') {
    const ageDays = daysBetween(inv.reviewedAt ?? inv.createdAt, now)
    return ageDays >= INVITE_FOLLOWUP_DAYS.changes_requested
      ? { level: 'followup', ageDays, reason: 'ยังไม่แก้ไขตามที่ขอ' }
      : { level: 'ok', ageDays }
  }
  return { level: 'ok', ageDays: 0 }
}

/** True when a still-live invite has passed its expiry (derived, not stored). */
export function isInviteExpired(inv: VendorInvite, now = Date.now()): boolean {
  return (inv.status === 'invited' || inv.status === 'opened') && new Date(inv.expiresAt).getTime() < now
}
