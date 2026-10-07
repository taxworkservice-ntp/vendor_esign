import { statusLabel } from './txn-filters'
import { downloadName, stamp } from './download-name'
import { whtFormLabel } from './wht'
import type { WhtRecordWithVendor } from './wht'
import { vendorDisplayName } from './vendor-name'
import type { PaymentTransaction, TxnStatus } from './types'

// CSV export of the transaction list. Three details make the difference between
// a file that opens and a file that does not:
//
//  1. A UTF-8 BOM. Without it Excel on Windows reads Thai as mojibake, because
//     it guesses the legacy codepage before it looks at the bytes.
//  2. RFC4180 quoting. Descriptions and vendor names routinely contain commas,
//     quotes and newlines; unescaped they silently shift every later column.
//  3. A stable column order and plain numbers, so the file can be pivoted.
//
// Values are written raw and formatted only for display columns — an amount
// column must stay numeric or Excel cannot sum it.

export const UTF8_BOM = '\uFEFF'

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | undefined | null
  /** Left as text instead of quoted when it holds no delimiter characters. */
  text?: boolean
}

function cell(v: string | number | undefined | null, text: boolean | undefined): string {
  if (v === undefined || v === null || v === '') return ''
  const s = String(v)
  if (text === false) return s
  // Quote when the value could break the row, and double any embedded quote.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => cell(c.header, undefined)).join(',')
  const body = rows.map((r) => columns.map((c) => cell(c.value(r), c.text)).join(','))
  // CRLF per RFC4180 so Excel on Windows does not collapse the file to one line.
  return [head, ...body].join('\r\n')
}

export function withBom(csv: string): string {
  return UTF8_BOM + csv
}

// ── The transaction list export ───────────────────────────────────────────

const STATUS_ORDER: TxnStatus[] = ['draft', 'sent', 'opened', 'signed', 'issued', 'expired', 'cancelled', 'void']

function statusSortKey(s: TxnStatus): string {
  return String(STATUS_ORDER.indexOf(s)).padStart(2, '0')
}

export const TXN_COLUMNS: CsvColumn<PaymentTransaction>[] = [
  { header: 'เลขที่รายการ', value: (t) => t.id, text: false },
  { header: 'เลขที่ใบเสร็จ', value: (t) => t.receiptNumber },
  { header: 'วันที่โอน', value: (t) => t.transferDate, text: false },
  { header: 'สถานะ', value: (t) => statusLabel(t.status) },
  { header: 'ผู้ขาย', value: (t) => vendorDisplayName(t.vendor.prefix, t.vendor.name) },
  { header: 'เลขประจำตัวผู้ขาย', value: (t) => t.vendor.taxId ?? t.vendor.maskedId, text: false },
  { header: 'รายละเอียด', value: (t) => t.note?.trim() || t.lineItems[0]?.description || t.description },
  { header: 'จำนวนรายการย่อย', value: (t) => t.lineItems.length, text: false },
  { header: 'ประเภทการจ่าย', value: (t) => t.paymentType },
  { header: 'ยอดรวม', value: (t) => t.grossAmount, text: false },
  { header: 'อัตราหัก ณ ที่จ่าย (%)', value: (t) => t.whtRate, text: false },
  { header: 'หัก ณ ที่จ่าย', value: (t) => t.whtAmount, text: false },
  { header: 'สุทธิ', value: (t) => t.netAmount, text: false },
  { header: 'เลขที่อ้างอิงสลิป', value: (t) => t.slipReference },
  { header: 'ไฟล์สลิป', value: (t) => t.slipName },
  { header: 'เหตุผลการยกเลิก', value: (t) => t.voidReason },
]

/** Sort rows for the file: transfer date, then status, so it reads as a ledger. */
export function sortForExport(txns: PaymentTransaction[]): PaymentTransaction[] {
  return [...txns].sort(
    (a, b) => a.transferDate.localeCompare(b.transferDate) || statusSortKey(a.status).localeCompare(statusSortKey(b.status)) || a.id.localeCompare(b.id),
  )
}

export function txnsToCsv(txns: PaymentTransaction[]): string {
  return withBom(toCsv(sortForExport(txns), TXN_COLUMNS))
}

/**
 * Generic dated CSV name. Prefer `downloadName()` with a `kind`/`clientCode`
 * for anything user-facing; this remains for callers that only need a stamp.
 */
export function exportFilename(when: Date = new Date()): string {
  return `transactions-${stamp(when)}.csv`
}

/**
 * Trigger a browser download. Kept here (not in a component) so the export
 * path is testable and the URL is always revoked.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ── WHT register export ───────────────────────────────────────────────────
// The register is what gets reconciled against the filed return, so the export
// has to carry the same Thai form labels the screen shows, and amounts as bare
// numbers. The UTF-8 BOM from withBom is what stops Excel mangling them.

export const WHT_COLUMNS: CsvColumn<WhtRecordWithVendor>[] = [
  { header: 'เลขที่หนังสือรับรอง', value: (r) => r.certificateNo },
  { header: 'เลขที่ใบเสร็จ', value: (r) => r.receiptNumber ?? '' },
  { header: 'แบบยื่น', value: (r) => whtFormLabel(r.formType) },
  { header: 'วันที่ออก', value: (r) => r.issueDate, text: false },
  { header: 'ผู้ถูกหักภาษี', value: (r) => r.vendorName ?? '' },
  { header: 'เลขประจำตัวผู้ถูกหักภาษี', value: (r) => r.vendorTaxId ?? '' },
  { header: 'รายละเอียด', value: (r) => r.description ?? '' },
  { header: 'ยอดเงิน (ฐานภาษี)', value: (r) => r.amount, text: false },
  { header: 'อัตราหัก (%)', value: (r) => r.whtRate, text: false },
  { header: 'ภาษีที่หักไว้', value: (r) => r.whtAmount, text: false },
  { header: 'สถานะ', value: (r) => (r.status === 'done' ? 'ยื่นแล้ว' : r.status === 'void' ? 'ยกเลิก' : r.status === 'superseded' ? 'แทนที่แล้ว' : 'ยังไม่ยื่น') },
  { header: 'หมายเหตุ', value: (r) => r.note ?? '' },
]

export function whtToCsv(records: WhtRecordWithVendor[]): string {
  return withBom(toCsv(records, WHT_COLUMNS))
}
