import { describe, expect, it } from 'vitest'
import { exportFilename, itemsToCsv, receiptsToCsv, sortForExport, toCsv, txnsToCsv, UTF8_BOM, withBom, type CsvColumn } from './csv'
import type { PaymentTransaction } from './types'
import type { ReceiptRegisterRow } from './receipts-register'
import type { CatalogItem } from './items-mock'

function txn(o: Partial<PaymentTransaction> & Pick<PaymentTransaction, 'id'>): PaymentTransaction {
  return {
    tenantId: 'ABC',
    vendor: { id: 'v1', prefix: 'นาย', name: 'สมชาย การช่าง', address: 'a', maskedId: 'x-xxxx-xxxxx-12-3' },
    paymentType: 'ค่าบริการ',
    description: 'งานซ่อม',
    note: '',
    lineItems: [{ description: 'งานซ่อม', amount: 3000 }],
    grossAmount: 3000,
    whtRate: 3,
    whtMode: 'deduct',
    whtAmount: 90,
    netAmount: 2910,
    transferDate: '2026-09-22',
    slipReference: 'TRF-1',
    slipName: 'slip.png',
    status: 'issued',
    createdAt: '2026-09-20T09:00:00+07:00',
    timeline: [],
    checks: [],
    ...o,
  }
}

describe('toCsv escaping', () => {
  const cols: CsvColumn<{ v: string }>[] = [{ header: 'h', value: (r) => r.v }]

  it('emits a header row and CRLF line endings', () => {
    expect(toCsv([{ v: 'a' }, { v: 'b' }], cols)).toBe('h\r\na\r\nb')
  })

  it('quotes values containing a comma, quote or newline', () => {
    expect(toCsv([{ v: 'a,b' }], cols)).toBe('h\r\n"a,b"')
    expect(toCsv([{ v: 'say "hi"' }], cols)).toBe('h\r\n"say ""hi"""')
    expect(toCsv([{ v: 'line1\nline2' }], cols)).toBe('h\r\n"line1\nline2"')
  })

  it('leaves ordinary values unquoted', () => {
    expect(toCsv([{ v: 'plain' }], cols)).toBe('h\r\nplain')
  })

  it('renders null/undefined/empty as an empty field, not "null"', () => {
    const c: CsvColumn<{ v?: string | null }>[] = [{ header: 'h', value: (r) => r.v }]
    expect(toCsv([{ v: null }, {}, { v: '' }], c)).toBe('h\r\n\r\n\r\n')
  })

  it('keeps numbers unquoted by default so Excel can sum the column', () => {
    const c: CsvColumn<{ n: number }>[] = [{ header: 'h', value: (r) => r.n, text: false }]
    expect(toCsv([{ n: 2910.5 }], c)).toBe('h\r\n2910.5')
  })

  it('emits only the header for an empty row set', () => {
    expect(toCsv([], cols)).toBe('h')
  })
})

describe('UTF-8 BOM', () => {
  it('prefixes the file so Excel detects Thai', () => {
    expect(withBom('h\r\na')).toBe(`${UTF8_BOM}h\r\na`)
  })

  it('is the actual U+FEFF code point', () => {
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff)
  })
})

describe('sortForExport', () => {
  it('orders by transfer date, then status, then id — and does not mutate the input', () => {
    const rows = [
      txn({ id: 'B', transferDate: '2026-09-10', status: 'issued' }),
      txn({ id: 'A', transferDate: '2026-09-10', status: 'draft' }),
      txn({ id: 'C', transferDate: '2026-09-01', status: 'issued' }),
    ]
    const out = sortForExport(rows)
    expect(out.map((t) => t.id)).toEqual(['C', 'A', 'B'])
    expect(rows.map((t) => t.id)).toEqual(['B', 'A', 'C'])
  })

  it('places a draft before an issued row on the same date', () => {
    const rows = [txn({ id: 'X', status: 'issued' }), txn({ id: 'Y', status: 'draft' })]
    expect(sortForExport(rows).map((t) => t.id)).toEqual(['Y', 'X'])
  })
})

describe('txnsToCsv', () => {
  const csv = txnsToCsv([txn({ id: 'TX-1' })])

  it('starts with the BOM', () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
  })

  it('uses Thai headers a bookkeeper recognises', () => {
    expect(csv).toContain('เลขที่รายการ')
    expect(csv).toContain('ผู้ขาย')
    expect(csv).toContain('ยอดรวม')
    expect(csv).toContain('หัก ณ ที่จ่าย')
    expect(csv).toContain('สุทธิ')
  })

  it('writes the vendor display name with its prefix', () => {
    expect(csv).toContain('นาย สมชาย การช่าง')
  })

  it('writes amounts as bare numbers', () => {
    const line = csv.split('\r\n').find((l) => l.includes('TX-1'))!
    expect(line).toContain(',3000,3,90,2910,')
  })

  it('labels the status in Thai', () => {
    expect(csv).toContain('ออกใบเสร็จแล้ว')
  })

  it('quotes a description containing a comma instead of shifting columns', () => {
    const out = txnsToCsv([txn({ id: 'TX-2', note: 'งาน, ซ่อมแอร์' })])
    const line = out.split('\r\n').find((l) => l.includes('TX-2'))!
    expect(line).toContain('"งาน, ซ่อมแอร์"')
    // The trailing columns are still in place.
    expect(line.endsWith(',2910,TRF-1,slip.png,')).toBe(true)
  })

  it('escapes a doubled quote', () => {
    const out = txnsToCsv([txn({ id: 'TX-3', note: 'say "ok"' })])
    expect(out).toContain('"say ""ok"""')
  })

  it('emits a header even with no rows', () => {
    const out = txnsToCsv([])
    expect(out.startsWith(`${UTF8_BOM}เลขที่รายการ,เลขที่ใบเสร็จ,`)).toBe(true)
    expect(out).not.toContain('\r\n')
  })

  it('leaves optional fields blank rather than undefined', () => {
    const out = txnsToCsv([txn({ id: 'TX-4', receiptNumber: undefined, voidReason: undefined })])
    const line = out.split('\r\n').find((l) => l.includes('TX-4'))!
    expect(line).not.toContain('undefined')
  })
})

describe('receiptsToCsv', () => {
  const row: ReceiptRegisterRow = {
    id: 'TX-1', number: 'ABC-R-2569-0001', issueDate: '2026-10-02', transferDate: '2026-09-30',
    verificationCode: 'ABCD1234', vendorPrefix: 'นาย', vendorName: 'สมชาย การช่าง',
    grossAmount: 3000, whtRate: 3, whtAmount: 90, netAmount: 2910,
  }
  const csv = receiptsToCsv([row])

  it('starts with the BOM and carries the register columns', () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv).toContain('เลขที่ใบเสร็จ')
    expect(csv).toContain('อัตราหัก (%)')
    expect(csv).toContain('รหัสตรวจสอบ')
  })

  it('writes the vendor name and bare amounts', () => {
    const line = csv.split('\r\n').find((l) => l.includes('ABC-R-2569-0001'))!
    expect(line).toContain('นาย สมชาย การช่าง')
    expect(line).toContain(',3000,3,90,2910,')
  })
})

describe('itemsToCsv', () => {
  const item: CatalogItem = {
    id: 'it-1', tenantId: 'ABC', itemNo: 1, name: 'ค่าจ้างทำความสะอาด', unit: 'งาน', unitPrice: 5000,
    paymentType: 'ค่าจ้างทำของ', subItems: ['ด้านหน้า', 'ด้านหลัง'], isActive: true, createdAt: '2026-09-20T09:00:00+07:00',
  }
  const csv = itemsToCsv([item])

  it('registers columns with the tax type and joined sub-notes', () => {
    expect(csv).toContain('ITM-001')
    expect(csv).toContain('ค่าจ้างทำของ')
    expect(csv).toContain('ด้านหน้า · ด้านหลัง')
    expect(csv).toContain('ใช้งาน')
  })
})

describe('exportFilename', () => {
  it('stamps the local date and time so exports do not overwrite', () => {
    expect(exportFilename(new Date(2026, 8, 30, 14, 5))).toBe('transactions-20260930-1405.csv')
  })

  it('zero-pads every field', () => {
    expect(exportFilename(new Date(2026, 0, 2, 3, 4))).toBe('transactions-20260102-0304.csv')
  })
})
