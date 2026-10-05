// WHT (withholding tax) domain — types + pure helpers ported from
// invoice-system (wht/print.tsx + whtCertificate.ts) so output matches exactly.
// Certificate number format: YYMM + series digit + 3-digit sequence per
// workspace/month (e.g. 26091003).

export type WhtFormType = 'pnd1' | 'pnd1_special' | 'pnd2' | 'pnd3' | 'pnd2a' | 'pnd3a' | 'pnd53'

/** Canonical order, used for the breakdown strip and the form filter. */
export const WHT_FORM_TYPES: WhtFormType[] = ['pnd1', 'pnd1_special', 'pnd2', 'pnd2a', 'pnd3', 'pnd3a', 'pnd53']

/**
 * The government form names a bookkeeper actually refers to. The list used to
 * render the raw code uppercased ("PND3"), which is not what appears on the
 * return they reconcile against.
 */
export const WHT_FORM_LABELS: Record<WhtFormType, string> = {
  pnd1: 'ภ.ง.ด.1',
  pnd1_special: 'ภ.ง.ด.1 (พิเศษ)',
  pnd2: 'ภ.ง.ด.2',
  pnd2a: 'ภ.ง.ด.2/53',
  pnd3: 'ภ.ง.ด.3',
  pnd3a: 'ภ.ง.ด.3/54',
  pnd53: 'ภ.ง.ด.53',
}

/** Longer descriptions, for the column header tooltip and the print view. */
export const WHT_FORM_TITLES: Record<WhtFormType, string> = {
  pnd1: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย เงินได้ตามประเภทที่จ่าย',
  pnd1_special: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย แบบพิเศษ',
  pnd2: 'หนังสือรับรองการหักภาษี ณ ที่จ่ายสำหรับผู้ถูกหักภาษีที่เป็นบุคคลธรรมดา',
  pnd2a: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย แบบรวม',
  pnd3: 'หนังสือรับรองการหักภาษี ณ ที่จ่ายสำหรับผู้ถูกหักภาษีที่เป็นบุคคลธรรมดา',
  pnd3a: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย แบบรวม',
  pnd53: 'หนังสือรับรองการหักภาษี ณ ที่จ่ายสำหรับผู้ถูกหักภาษีที่เป็นนิติบุคคล',
}

/**
 * A certificate as the list renders it: the record plus the payee details
 * joined in from wht_vendors. Lives here rather than in wht-source.ts so the
 * server can type its mapper without importing a client-only module.
 */
export type WhtRecordWithVendor = WhtRecord & {
  vendorName?: string
  vendorTaxId?: string
  vendorAddress?: string
}

export function whtFormLabel(t: string): string {
  return WHT_FORM_LABELS[t as WhtFormType] ?? String(t).toUpperCase()
}

export function whtFormTitle(t: string): string {
  return WHT_FORM_TITLES[t as WhtFormType] ?? ''
}

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
  vendorType?: 'company' | 'individual'
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
  /** Payment type label (ประเภทการจ่าย) — the income category printed on the WHT form. */
  description?: string
  /** Raw payment type key (e.g. "ค่าบริการ") from the source transaction. */
  paymentType?: string
  note?: string
  status: 'active' | 'done'
  createdAt: string
  // Set when the certificate was auto-generated from an issued receipt.
  sourceTransactionId?: string
}

// This app serves individual vendors only — every certificate is PND3.
export function formTypeForVendorType(_t: 'company' | 'individual'): WhtFormType {
  return 'pnd3'
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Certificate number: YYMM + series digit + 3-digit sequence per
// workspace/month, mirroring generate_wht_certificate_no().
// The series digit '1' reserves this system's block: the client also issues
// WHT certificates outside this app under a different leading block, so the
// fixed '1' keeps the two sources collision-free (pilot convention — one
// client; graduate to per-source counters if more issuers appear).
// Old 7-char numbers (YYMMNNN, no series digit) stay valid; old and new share
// one counter per month since the sequence always reads the last 3 digits.
const WHT_SERIES = '1'

// YYMM + series digit + 3-digit sequence, mirroring generate_wht_certificate_no().
export function nextWhtCertificateNo(existing: (string | undefined)[], issueDate: string): string {
  const yymm = issueDate.slice(2, 7).replace('-', '')
  let maxSeq = 0
  for (const no of existing) {
    if (!no || !no.startsWith(yymm)) continue
    const seq = parseInt(no.slice(-3), 10)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${yymm}${WHT_SERIES}${String(maxSeq + 1).padStart(3, '0')}`
}

export function calcWhtAmount(amount: number, ratePct: number): number {
  return round2(amount * (ratePct / 100))
}

// Global-month scope for WHT lists: filter on issueDate (YYYY-MM-DD), NOT
// transferDate. A receipt transferred Sept 30 but issued Oct 2 belongs to
// October here. '' (all time) returns the input unchanged.
export function filterWhtByMonth<T extends { issueDate: string }>(records: T[], month: string): T[] {
  if (!month) return records
  return records.filter((r) => r.issueDate.startsWith(month))
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
  return `${digits[0]}    ${g1}       ${g2}      ${g3}   ${digits[12]}`
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
