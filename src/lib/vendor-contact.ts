// Vendor contact validation — shared by the signing form (client) and the
// signing endpoint (server), so both enforce the same rule and can never drift.
// Contacts are required at signing: the receipt prints them and the payer
// needs a real channel to reach the payee about their money.

/** Digits only — strips spaces, dashes and parentheses before validating. */
export function normalizePhone(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * Thai phone: 9–10 digits starting with 0. Accepts mobiles (06/08/09) and
 * landlines (02/03x/…); rejects short, foreign (+66 without trunk) and
 * non-numeric input. Deliberately not mobile-only — vendors do use landlines.
 */
export function isValidPhone(v: string): boolean {
  const d = normalizePhone(v)
  return /^\d{9,10}$/.test(d) && d.startsWith('0')
}

/** Same shape check as vendor creation — a real address, not just text. */
export function isValidEmail(v: string): boolean {
  const s = (v ?? '').trim()
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export const PHONE_REQUIRED_ERROR = 'กรุณากรอกเบอร์โทรศัพท์ 9–10 หลัก ขึ้นต้นด้วย 0'
export const EMAIL_REQUIRED_ERROR = 'กรุณากรอกอีเมลให้ถูกต้อง'
