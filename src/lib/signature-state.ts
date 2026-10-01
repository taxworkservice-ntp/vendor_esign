import type { PaymentTransaction } from './types'

// What the receipt's signature block should show.
//
// This exists because the previous markup always drew the signature rule, the
// "ผู้มีอำนาจลงนาม" caption and the vendor's name, and only the <img> was
// conditional. So an unsigned receipt — or one whose signature the client could
// not load — was indistinguishable from a correctly signed one. On a tax
// receipt that is the worst possible failure: it reads as a missing scan.
//
// Four states, and the distinction that matters is between "not signed" and
// "signed but the image is not here".

export type SignatureState =
  | { kind: 'unsigned' }
  | { kind: 'loading' }
  | { kind: 'ready'; png: string }
  /** Signed, but the signature image could not be retrieved. */
  | { kind: 'missing' }

/** Statuses that mean the vendor has signed (or the receipt is already out). */
const SIGNED: PaymentTransaction['status'][] = ['signed', 'issued']

export function isSigned(t: Pick<PaymentTransaction, 'status'>): boolean {
  return SIGNED.includes(t.status)
}

export function signatureState(
  t: Pick<PaymentTransaction, 'status'>,
  png: string | null | undefined,
  opts: { loading?: boolean } = {},
): SignatureState {
  if (!isSigned(t)) return { kind: 'unsigned' }
  // A signed row with no image and nothing in flight is a real gap, not a
  // loading state — surface it instead of spinning forever.
  if (png) return { kind: 'ready', png }
  if (opts.loading) return { kind: 'loading' }
  return { kind: 'missing' }
}

/** Thai copy for each state, so the wording lives next to the rule. */
export const SIGNATURE_COPY: Record<Exclude<SignatureState['kind'], 'ready'>, { title: string; detail: string }> = {
  unsigned: {
    title: 'ยังไม่ได้ลงนาม',
    detail: 'ผู้ขายยังไม่ได้ยืนยันรายการนี้ — ออกใบเสร็จไม่ได้จนกว่าจะลงนาม',
  },
  loading: {
    title: 'กำลังโหลดลายเซ็น…',
    detail: '',
  },
  missing: {
    title: 'ลายเซ็นอยู่ในใบเสร็จฉบับที่ออกจริง',
    detail: 'ไฟล์ลายเซ็นไม่สามารถโหลดได้จากเซิร์ฟเวอร์ — กรุณาดาวน์โหลดใบเสร็จฉบับออกจริงแทน',
  },
}
