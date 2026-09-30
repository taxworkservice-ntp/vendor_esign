import { currentBeYear } from './settings'
import type { PaymentTransaction } from './types'

// Mock-only derivation. Real backend: series number from the counter table
// inside the finalization txn + random verification_code per receipt.
// Per-vendor series: RCT-{VENDORNO}-{BE_YEAR}-{NNNN}.
export function mockReceiptNumber(txnId: string, vendorNo = 0): string {
  let h = 0
  for (const ch of txnId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `RCT-${String(vendorNo).padStart(3, '0')}-${currentBeYear()}-${String((h % 9000) + 1000)}`
}

export function mockVerificationCode(txnId: string): string {
  let h = 7
  for (const c of txnId) h = (h * 33 + c.charCodeAt(0)) >>> 0
  return h.toString(16).toUpperCase().padStart(8, '0')
}

export function maskVendorName(name: string): string {
  const [first = '', ...rest] = name.split(' ')
  return `${first.slice(0, 2)}•• ${rest.length ? '••••' : ''}`.trim()
}

export interface PilotMetrics {
  created: number
  linksOpened: number
  signed: number
  expired: number
  medianHoursToSign: number | null
}

function atOf(t: PaymentTransaction, label: string): number | null {
  const e = t.timeline.find((x) => x.label === label)
  const ms = e ? Date.parse(e.at) : NaN
  return Number.isFinite(ms) ? ms : null
}

export function computeMetrics(txns: PaymentTransaction[]): PilotMetrics {
  const created = txns.length
  const linksOpened = txns.filter((t) => atOf(t, 'ผู้ขายเปิดลิงก์') !== null).length
  const signedTx = txns.filter((t) => ['signed', 'issued'].includes(t.status))
  const expired = txns.filter((t) => t.status === 'expired').length
  const hours = signedTx
    .map((t) => {
      const sent = atOf(t, 'ส่งลิงก์ให้ผู้ขาย')
      const signed = atOf(t, 'ผู้ขายลงนามรับเงินและมอบอำนาจ')
      return sent !== null && signed !== null ? (signed - sent) / 3600000 : null
    })
    .filter((h): h is number => h !== null && h >= 0)
    .sort((a, b) => a - b)
  const medianHoursToSign =
    hours.length === 0
      ? null
      : hours.length % 2 === 1
        ? hours[(hours.length - 1) / 2]
        : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2
  return { created, linksOpened, signed: signedTx.length, expired, medianHoursToSign }
}
