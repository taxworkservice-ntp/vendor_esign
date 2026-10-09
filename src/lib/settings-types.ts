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

/** Position + size in the WHT form's 1512×2138 coordinate space. */
export interface Placement {
  x: number
  y: number
  w: number
  h: number
}

// Signature sits above the sign-date; the stamp sits to its right. Both are
// user-adjustable on the WHT preview page and persisted here, so one placement
// applies to every WHT certificate for the workspace.
export const DEFAULT_SIGNATURE_PLACEMENT: Placement = { x: 964, y: 1883, w: 186, h: 70 }
export const DEFAULT_STAMP_PLACEMENT: Placement = { x: 1170, y: 1883, w: 139, h: 139 }

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
  /** Version label of the consent wording, stored with each authorization. */
  consentVersion: string
  receiptNote: string
  showVerifyQr: boolean
  inviteMessageTemplate: string
  /** Message sent with a vendor self-onboarding invite. Variables: {{link}} {{client}}. */
  vendorInviteMessageTemplate: string
  /** R2 storage path for the authorised signature image, placed on WHT forms. */
  signatureStoragePath?: string
  /** R2 storage path for the company stamp image (PNG with transparency preferred). */
  stampStoragePath?: string
  /** Where the signature is placed on the WHT form (falls back to the default). */
  signaturePlacement?: Placement
  /** Where the stamp is placed on the WHT form (falls back to the default). */
  stampPlacement?: Placement
}

export const DEFAULT_CONSENT_VERSION = '2'

// Full vendor consent. Variables: {{client}} {{amount}} {{date}} {{ref}} {{version}}.
// Deliberately explicit: it is the vendor's authorization for the payer to issue
// the receipt in the vendor's name, plus the electronic-signature legal basis.
export const DEFAULT_CONSENT = `ข้าพเจ้าขอรับรองและให้ความยินยอมดังต่อไปนี้
(1) ข้าพเจ้าขอรับรองว่าข้อมูลที่ให้ไว้ในเอกสารนี้ (ชื่อ ที่อยู่ เลขประจำตัวประชาชน และข้อมูลการรับเงิน) เป็นความจริงและถูกต้องทุกประการ และข้าพเจ้าเป็นผู้มีสิทธิรับเงินตามรายการนี้
(2) ข้าพเจ้าได้รับชำระเงินค่าจ้าง/ค่าบริการตามรายการข้างต้นครบถ้วนแล้ว — ยอดรับสุทธิ {{amount}} บาท วันที่ {{date}} อ้างอิง {{ref}}
(3) ข้าพเจ้าขอมอบอำนาจและให้ความยินยอมแก่ {{client}} ในการออกใบเสร็จรับเงินในนามของข้าพเจ้า สำหรับธุรกรรมนี้เท่านั้น
(4) ข้าพเจ้ายินยอมให้ลายมือชื่ออิเล็กทรอนิกส์ที่ข้าพเจ้าลงในเอกสารนี้มีผลผูกพันทางกฎหมายเสมือนการลงลายมือชื่อด้วยมือ ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
(5) ข้าพเจ้าได้อ่านและเข้าใจข้อความข้างต้นแล้ว จึงลงนามเพื่อยืนยัน`

// The pre-upgrade default. Tenants whose stored consent still equals this are
// shown the new default (see loadSettings / getTenantSettings) so the upgrade
// takes effect without a data migration.
export const LEGACY_DEFAULT_CONSENT =
  'ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าสำหรับธุรกรรมนี้เท่านั้น'

// PDPA notice shown under the consent on the signing screen.
export const PDPA_STATEMENT =
  'การเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้า ดำเนินการตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 โดยมีวัตถุประสงค์เพื่อยืนยันตัวตน ออกเอกสารทางภาษี และดำเนินการชำระเงินสำหรับธุรกรรมนี้ · ผู้เข้าถึงข้อมูล: ลูกค้าผู้จ่ายและผู้ให้บริการระบบที่ได้รับมอบหมาย · ระยะเวลาจัดเก็บ: ตามที่กฎหมายกำหนดและนโยบายของลูกค้าผู้จ่าย · ข้าพเจ้ามีสิทธิขอเข้าถึง แก้ไข หรือถอนความยินยอมได้ตามกฎหมาย'

export interface ConsentVars {
  client: string
  amount: string
  date: string
  ref: string
  version: string
}

export function renderConsent(template: string, vars: ConsentVars): string {
  return template
    .replace(/\{\{client\}\}/g, vars.client)
    .replace(/\{\{amount\}\}/g, vars.amount)
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{ref\}\}/g, vars.ref)
    .replace(/\{\{version\}\}/g, vars.version)
}

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

// Self-onboarding invite: no vendor/date/amount exist yet, only the link and the
// client's name. Kept separate from DEFAULT_INVITE_TEMPLATE so the wording fits.
export const DEFAULT_VENDOR_INVITE_TEMPLATE = `เรียน ผู้ขาย/ผู้รับจ้าง

{{client}} ขอความร่วมมือกรอกข้อมูลผู้ขาย เพื่อใช้ในการออกใบเสร็จรับเงินและโอนเงินให้ท่านอย่างถูกต้อง
กรุณากรอกข้อมูลและแนบเอกสารผ่านลิงก์นี้ (ใช้เวลาประมาณ 2–3 นาที)
{{link}}`

export interface VendorInviteMessageVars {
  client: string
  link: string
}

export function renderVendorInviteMessage(template: string, vars: VendorInviteMessageVars): string {
  return template.replace(/\{\{client\}\}/g, vars.client).replace(/\{\{link\}\}/g, vars.link)
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
  if (!(s.vendorInviteMessageTemplate ?? '').trim()) return 'กรุณากรอกข้อความเชิญผู้ขายกรอกข้อมูล'
  if (!(s.consentTextV1 ?? '').trim()) return 'กรุณากรอกข้อความให้ความยินยอม'
  if (!(s.consentVersion ?? '').trim()) return 'กรุณากรอกเวอร์ชันความยินยอม'
  return null
}

export function whtRateFor(paymentType: string, s: TenantSettings): number {
  return s.whtRates.find((r) => r.paymentType === paymentType)?.value ?? 0
}
