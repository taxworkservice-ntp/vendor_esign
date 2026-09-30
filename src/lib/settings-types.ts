// Settings types + pure helpers — no runtime deps (safe to import from the
// server bundle, which has no import.meta.env). Runtime defaults/store live in
// src/lib/settings.ts.

export interface WhtRate {
  paymentType: string
  value: number
  label: string
}

export interface TenantSettings {
  clientCode: string // required — receipt prefix + brand, e.g. ABC
  displayName: string // buyer name on the receipt
  address: string
  taxId: string
  contactName: string
  beYear: number // BE year used in the receipt number — derived from today, not user-set
  paymentTypes: string[]
  whtRates: WhtRate[]
  stampDutyWarningThreshold: number
  linkExpiryDays: number
  consentTextV1: string
  receiptNote: string
  showVerifyQr: boolean
  inviteMessageTemplate: string
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
  if (!(s.stampDutyWarningThreshold > 0)) return 'เกณฑ์เตือนอากรแสตมป์ต้องมากกว่า 0'
  if (!(s.linkExpiryDays > 0)) return 'อายุลิงก์ต้องมากกว่า 0 วัน'
  if (!(s.inviteMessageTemplate ?? '').trim()) return 'กรุณากรอกข้อความเชิญผู้ขาย'
  return null
}

export function whtRateFor(paymentType: string, s: TenantSettings): number {
  return s.whtRates.find((r) => r.paymentType === paymentType)?.value ?? 0
}
