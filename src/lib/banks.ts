// Curated list of Thai banks for the vendor bank-name field. Covers virtually
// every SME payee; the picker still offers "อื่น ๆ" so a vendor whose bank is
// not listed (or a legacy stored value) is never blocked.

export const THAI_BANKS = [
  'ธนาคารกสิกรไทย',
  'ธนาคารไทยพาณิชย์',
  'ธนาคารกรุงเทพ',
  'ธนาคารกรุงไทย',
  'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารทหารไทยธนชาต (ttb)',
  'ธนาคารออมสิน',
  'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
  'ธนาคารอาคารสงเคราะห์',
  'ธนาคารอิสลามแห่งประเทศไทย',
  'ธนาคารซีไอเอ็มบี ไทย',
  'ธนาคารยูโอบี',
  'ธนาคารแลนด์ แอนด์ เฮ้าส์',
  'ธนาคารเกียรตินาคินภัทร',
  'ธนาคารทิสโก้',
  'ธนาคารไทยเครดิต',
] as const

/** Sentinel option value meaning "not in the list — type it". */
export const BANK_OTHER = '__other__'

/** True when the stored bank name should show under "อื่น ๆ" (not in the list). */
export function isCustomBank(name: string): boolean {
  const n = (name ?? '').trim()
  return n !== '' && !(THAI_BANKS as readonly string[]).includes(n)
}
