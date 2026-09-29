// WHT (withholding tax) domain — types + pure helpers ported from
// invoice-system (wht/print.tsx + whtCertificate.ts) so output matches exactly.
// Certificate number format: YYMM + 3-digit sequence per workspace/month.

export type WhtFormType = 'pnd1' | 'pnd1_special' | 'pnd2' | 'pnd3' | 'pnd2a' | 'pnd3a' | 'pnd53'

export interface WhtVendor {
  id: string
  tenantId: string
  name: string
  taxId: string
  address: string
  contactName?: string
  phone?: string
  email?: string
  note?: string
  vendorType: 'company' | 'individual'
  isActive: boolean
  createdAt: string
}

export interface WhtRecord {
  id: string
  tenantId: string
  vendorId: string
  formType: WhtFormType
  issueDate: string // YYYY-MM-DD
  amount: number
  whtRate: number
  whtAmount: number
  certificateNo?: string
  description?: string
  note?: string
  status: 'active' | 'done'
  createdAt: string
}

// company → pnd53, individual → pnd3 (host rule).
export function formTypeForVendorType(t: 'company' | 'individual'): WhtFormType {
  return t === 'company' ? 'pnd53' : 'pnd3'
}

const round2 = (n: number) => Math.round(n * 100) / 100

// YYMM + 3-digit sequence, mirroring generate_wht_certificate_no().
export function nextWhtCertificateNo(existing: (string | undefined)[], issueDate: string): string {
  const yymm = issueDate.slice(2, 7).replace('-', '')
  let maxSeq = 0
  for (const no of existing) {
    if (!no || !no.startsWith(yymm)) continue
    const seq = parseInt(no.slice(-3), 10)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${yymm}${String(maxSeq + 1).padStart(3, '0')}`
}

export function calcWhtAmount(amount: number, ratePct: number): number {
  return round2(amount * (ratePct / 100))
}

// ── Formatting helpers (verbatim from the host print page) ──

export function fmtWhtDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch {
    return iso || ''
  }
}

export function fmtWhtNum(n: number | null | undefined): string {
  if (n == null || n === 0) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function splitTaxId(s: string | null | undefined): string {
  const digits = String(s || '').replace(/\D/g, '').slice(0, 13).padEnd(13, ' ')
  const g1 = digits.slice(1, 5).split('').join(' ')
  const g2 = digits.slice(5, 10).split('').join(' ')
  const g3 = digits.slice(10, 12).split('').join(' ')
  return `${digits[0]}    ${g1}      ${g2}       ${g3}   ${digits[12]}`
}

export function thaiBahtText(num: number | null | undefined): string {
  if (num == null) return ''
  const n = Math.floor(num)
  if (n === 0) return 'ศูนย์บาทถ้วน'
  const digits = 'ศูนย์,หนึ่ง,สอง,สาม,สี่,ห้า,หก,เจ็ด,แปด,เก้า'.split(',')
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
  const parts: string[] = []
  let remaining = n
  let pos = 0
  while (remaining > 0) {
    const d = remaining % 10
    remaining = Math.floor(remaining / 10)
    if (d === 0) {
      pos++
      continue
    }
    const unit = units[pos] || ''
    let word: string
    if (pos === 0 && d === 1 && parts.length > 0) word = 'เอ็ด'
    else if (pos === 1 && d === 2) word = 'ยี่' + unit
    else if (pos === 1 && d === 1) word = unit
    else word = digits[d] + unit
    parts.push(word)
    pos++
  }
  return parts.reverse().join('') + 'บาทถ้วน'
}
