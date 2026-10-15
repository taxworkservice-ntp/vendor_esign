// Bank account rules — shared by the client forms and the server routes so both
// enforce the same shape. Kept dependency-free so the server bundle can import
// it (like vendor-name.ts / vendor-contact.ts).

export interface BankFields {
  bankName?: string
  bankAccount?: string
  accountHolder?: string
}

/** Digits only — strips spaces, dashes and parentheses. */
export function normalizeBankAccount(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

/** Thai account numbers are ≥ 8 digits (most are 10–12). */
export function isValidBankAccount(v: string): boolean {
  return normalizeBankAccount(v).length >= 8
}

export const BANK_ACCOUNT_ERROR = 'กรุณากรอกเลขที่บัญชีให้ถูกต้อง (อย่างน้อย 8 หลัก)'
export const BANK_INCOMPLETE_ERROR = 'กรอกข้อมูลธนาคารให้ครบทั้ง 3 ช่อง (ธนาคาร · เลขที่บัญชี · ชื่อบัญชี) หรือเว้นว่างทั้งหมด'

/**
 * All-or-nothing validation: a vendor may have no bank info at all, but a
 * half-filled bank record is useless (can't be paid against). Returns an error
 * message, or null when the set is either fully empty or fully valid.
 */
export function bankValidation(f: BankFields): string | null {
  const name = (f.bankName ?? '').trim()
  const account = (f.bankAccount ?? '').trim()
  const holder = (f.accountHolder ?? '').trim()
  if (!name && !account && !holder) return null
  if (!name || !account || !holder) return BANK_INCOMPLETE_ERROR
  if (!isValidBankAccount(account)) return BANK_ACCOUNT_ERROR
  return null
}
