import { isVendorPrefix, prefixRequired } from './vendor-name'
import { isValidTaxIdChecksum, normalizeTaxId } from './taxid'

// Pure validation for the vendor self-onboarding form. Extracted from the page
// so the rules are unit-testable and the UI can show one error per field
// instead of a single line at the bottom.

export type OnboardField =
  | 'name'
  | 'prefix'
  | 'address'
  | 'taxId'
  | 'bankName'
  | 'bankAccount'
  | 'accountHolder'
  | 'idDoc'
  | 'consent'

export type OnboardErrors = Partial<Record<OnboardField, string>>

export interface OnboardInput {
  prefix: string
  name: string
  address: string
  taxId: string
  bankName: string
  bankAccount: string
  accountHolder: string
  /** Whether the required ID-card photo has been attached. */
  hasIdDoc: boolean
  consent: boolean
}

/** Top-to-bottom order used to focus the first invalid field on submit. */
export const ONBOARD_FIELD_ORDER: OnboardField[] = [
  'name',
  'prefix',
  'address',
  'taxId',
  'bankName',
  'bankAccount',
  'accountHolder',
  'idDoc',
  'consent',
]

export function validateOnboard(v: OnboardInput): OnboardErrors {
  const errors: OnboardErrors = {}
  if (v.name.trim().length < 2) errors.name = 'กรุณากรอกชื่อ-นามสกุล'
  if (prefixRequired(v.name) && !isVendorPrefix(v.prefix)) errors.prefix = 'กรุณาเลือกคำนำหน้าชื่อ'
  if (v.address.trim().length < 4) errors.address = 'กรุณากรอกที่อยู่'

  const id = normalizeTaxId(v.taxId)
  if (id.length !== 13) errors.taxId = 'เลขบัตรประชาชนต้องเป็นเลข 13 หลัก'
  else if (!isValidTaxIdChecksum(id)) errors.taxId = 'เลขบัตรประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)'

  if (!v.bankName.trim()) errors.bankName = 'กรุณากรอกธนาคาร'
  if (v.bankAccount.replace(/\D/g, '').length < 8) errors.bankAccount = 'กรุณากรอกเลขบัญชีให้ถูกต้อง'
  if (!v.accountHolder.trim()) errors.accountHolder = 'กรุณากรอกชื่อบัญชี'
  if (!v.hasIdDoc) errors.idDoc = 'กรุณาแนบรูปบัตรประชาชน'
  if (!v.consent) errors.consent = 'กรุณายินยอมให้เก็บและใช้ข้อมูล'

  return errors
}

/** The first field (in visual order) that has an error, or null. */
export function firstInvalidField(errors: OnboardErrors): OnboardField | null {
  return ONBOARD_FIELD_ORDER.find((f) => errors[f]) ?? null
}

/**
 * Short, stable human reference for an invite, derived from its id — printed on
 * the submission evidence and shown to the client so both sides can quote the
 * same number without storing an extra code.
 */
export function onboardRef(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `VN-${clean.slice(0, 8)}`
}
