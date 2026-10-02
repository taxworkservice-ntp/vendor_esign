// Settings types + pure helpers — no runtime deps (safe to import from the
// server bundle, which has no import.meta.env). Runtime defaults/store live in
// src/lib/settings.ts.

export interface WhtRate {
  paymentType: string
  value: number
  label: string
}

// Revenue Department standard WHT income categories for PND3 (บุคคลธรรมดา).
// Fixed presets — clients cannot add, remove, or rename these. Lives here (not
// in config.ts) so the server can seed new tenants without import.meta.env.
export const DEFAULT_WHT_RATES: WhtRate[] = [
  { value: 3, label: 'ค่าจ้างทำของ', paymentType: 'ค่าจ้างทำของ' },
  { value: 3, label: 'ค่าวิชาชีพอิสระ', paymentType: 'ค่าวิชาชีพอิสระ' },
  { value: 3, label: 'ค่าบริการ', paymentType: 'ค่าบริการ' },
  { value: 5, label: 'ค่าเช่าทรัพย์สิน', paymentType: 'ค่าเช่าทรัพย์สิน' },
  { value: 3, label: 'ค่านายหน้า', paymentType: 'ค่านายหน้า' },
  { value: 1, label: 'ค่าขนส่ง', paymentType: 'ค่าขนส่ง' },
  { value: 0, label: 'ไม่หักภาษี ณ ที่จ่าย', paymentType: 'ไม่หักภาษี ณ ที่จ่าย' },
]

/** มาตรา 50/1 default minimum (baht) before WHT applies. */
export const DEFAULT_WHT_MIN_THRESHOLD = 1000

export interface TenantSettings {
  clientCode: string // required — receipt prefix + brand, e.g. ABC
  displayName: string // buyer name on the receipt
  address: string
  taxId: string
  contactName: string
  beYear: number // BE year used in the receipt number — derived from today, not user-set
  paymentTypes: string[]
  whtRates: WhtRate[]
  /** มาตรา 50/1: if gross base < threshold, WHT is not required (rate → 0). 0 = disabled. */
  whtMinThreshold: number
  linkExpiryDays: number
  consentTextV1: string
  receiptNote: string
  showVerifyQr: boolean
  inviteMessageTemplate: string
  /** R2 storage path for the authorised signature image, placed on WHT forms. */
  signatureStoragePath?: string
  /** R2 storage path for the company stamp image (PNG with transparency preferred). */
  stampStoragePath?: string
}

export const DEFAULT_CONSENT =
  'ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าสำหรับธุรกรรมนี้เท่านั้น'

// The receipt-year is never user-set: it is always the current Thai (BE) year,
// derived from today. Used by the receipt-number series {CODE}-R-{BE}-{NNN}.
export function currentBeYear(today: Date = new Date()): number {
  return today.getFullYear() + 543
}

// Placeholders: {{vendor}} {{date}} {{amount}} {{link}} {{client}}.
// Deliberately no internal transaction/reference id — the vendor has no way to
// know it. Keep the wording vendor-friendly.
export const DEFAULT_INVITE_TEMPLATE = `เรียน คุณ{{vendor}}

แจ้งยอดโอนสำหรับรายการวันที่ {{date}}
ยอดรับสุทธิ {{amount}} บาท

กรุณาเปิดลิงก์เพื่อลงนามรับเงินและมอบอำนาจออกใบเสร็จ (ลิงก์ใช้ได้จนกว่าจะลงนาม)
{{link}}`

export interface InviteMessageVars {
  vendor: string
  vendorPrefix: string
  date: string
  amount: string
  link: string
  client: string
}

export function renderInviteMessage(template: string, vars: InviteMessageVars): string {
  return template
    .replace(/\{\{vendorPrefix\}\}/g, vars.vendorPrefix)
    .replace(/\{\{vendor\}\}/g, vars.vendor)
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{amount\}\}/g, vars.amount)
    .replace(/\{\{link\}\}/g, vars.link)
    .replace(/\{\{client\}\}/g, vars.client)
}

export function validateSettings(s: TenantSettings): string | null {
  if (!/^[A-Z0-9-]{2,12}$/.test(s.clientCode)) return 'รหัสลูกค้าใช้ A-Z 0-9 ยาว 2–12 ตัว (ใช้เป็นคำนำหน้าเลขที่ใบเสร็จ)'
  if (!s.displayName.trim()) return 'กรุณากรอกชื่อบริษัท'
  if (s.taxId && !/^\d{13}$/.test(s.taxId)) return 'เลขประจำตัวผู้เสียภาษีต้องเป็นเลข 13 หลัก'
  if (s.paymentTypes.length === 0) return 'ต้องมีประเภทการจ่ายอย่างน้อย 1 รายการ'
  if (s.whtRates.some((r) => r.value < 0)) return 'อัตรา WHT ต้องไม่ติดลบ'
  if (!Number.isFinite(s.whtMinThreshold) || s.whtMinThreshold < 0) return 'ยอดขั้นต่ำหักภาษีต้องเป็นตัวเลข ≥ 0'
  if (!(s.linkExpiryDays > 0)) return 'อายุลิงก์ต้องมากกว่า 0 วัน'
  if (!(s.inviteMessageTemplate ?? '').trim()) return 'กรุณากรอกข้อความเชิญผู้ขาย'
  return null
}

export function whtRateFor(paymentType: string, s: TenantSettings): number {
  return s.whtRates.find((r) => r.paymentType === paymentType)?.value ?? 0
}
