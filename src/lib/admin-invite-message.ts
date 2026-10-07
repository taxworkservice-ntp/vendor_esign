// First-login message the provider copies to a new client user (LINE/email)
// together with the one-time temp password. Thai copy lives next to the rule
// so the pasted text and the preview can never drift apart.

export interface FirstLoginMessageInput {
  /** Full login URL, e.g. `${window.location.origin}/login`. */
  loginUrl: string
  email: string
  tempPassword: string
}

export function buildFirstLoginMessage({ loginUrl, email, tempPassword }: FirstLoginMessageInput): string {
  return [
    'Taxwork — แจ้งบัญชีผู้ใช้ใหม่',
    '',
    'ทางเราได้สร้างบัญชีให้ท่านแล้ว กรุณาเข้าสู่ระบบครั้งแรกดังนี้',
    `1. เปิดลิงก์: ${loginUrl}`,
    `2. ใส่อีเมล: ${email} และรหัสผ่านชั่วคราว: ${tempPassword}`,
    '3. ระบบจะให้ตั้งรหัสผ่านใหม่ทันที (บังคับเปลี่ยนครั้งแรก)',
    '',
    'หมายเหตุ: รหัสผ่านชั่วคราวหมดอายุใน 7 วัน หากเข้าไม่ได้โปรดแจ้งเราเพื่อออกรหัสใหม่',
  ].join('\n')
}
