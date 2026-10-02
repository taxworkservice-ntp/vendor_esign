import { describe, expect, it } from 'vitest'
import { contentDisposition, documentFileName, downloadName, stamp, trimVendor } from './download-name'

const when = new Date(2026, 9, 2, 14, 30) // 2026-10-02 14:30 local

describe('stamp', () => {
  it('formats a sortable local YYYYMMDD-HHMM', () => {
    expect(stamp(when)).toBe('20261002-1430')
  })
})

describe('downloadName', () => {
  it('joins kind + client + period + stamp', () => {
    expect(downloadName({ kind: 'transactions', clientCode: 'ABC', period: '2026-10', ext: 'csv', when })).toBe(
      'transactions-ABC-2026-10-20261002-1430.csv',
    )
  })

  it('omits the timestamp for fixed artifacts', () => {
    expect(
      downloadName({ kind: 'wht-certificate', clientCode: 'ABC', qualifier: '26091001', ext: 'pdf', when: null }),
    ).toBe('wht-certificate-ABC-26091001.pdf')
  })

  it('keeps the kind verbatim but drops empty/redundant periods', () => {
    expect(downloadName({ kind: 'vendors', clientCode: undefined, ext: 'csv', when })).toBe(
      'vendors-20261002-1430.csv',
    )
    // "all" adds nothing over the kind, so it is dropped.
    expect(downloadName({ kind: 'wht-certificates', clientCode: 'ABC', period: 'all', ext: 'csv', when })).toBe(
      'wht-certificates-ABC-20261002-1430.csv',
    )
  })

  it('sanitises unsafe characters', () => {
    const name = downloadName({ kind: 'receipt', clientCode: 'A/B', qualifier: 'RCT 001/2569', ext: 'pdf', when: null })
    expect(name).not.toMatch(/[/\\]/)
    expect(name.endsWith('.pdf')).toBe(true)
  })
})

describe('trimVendor', () => {
  it('drops the personal title and joins words with _', () => {
    expect(trimVendor('นาย สมชาย การช่าง')).toBe('สมชาย_การช่าง')
    expect(trimVendor('นาย สมชาย ใจดี')).toBe('สมชาย_ใจดี')
    expect(trimVendor('นางสาว สุดา')).toBe('สุดา')
    expect(trimVendor('บริษัท ซัพพลาย พลัส')).toBe('บริษัท_ซัพพลาย_พลัส')
  })

  it('passes short names through and hard-cuts a single long token at 20', () => {
    expect(trimVendor('สมชาย')).toBe('สมชาย')
    expect(trimVendor('ก'.repeat(25))).toBe('ก'.repeat(20))
  })

  it('fills to the limit at a word boundary when over the limit', () => {
    const long = 'นาย สมชาย การช่างไฟฟ้าอุตสาหกรรม' // over 20 once titles are dropped
    expect(trimVendor(long).length).toBeLessThanOrEqual(20)
    expect(trimVendor(long).startsWith('สมชาย_')).toBe(true)
  })
})

describe('documentFileName', () => {
  it('builds number-vendor_amount.pdf', () => {
    expect(
      documentFileName({ number: 'RCT-001-2569-001', vendorName: 'สมชาย การช่าง', amount: 5000 }),
    ).toBe('RCT-001-2569-001-สมชาย_การช่าง_5000.00.pdf')
  })

  it('omits the vendor or amount when absent', () => {
    expect(documentFileName({ number: '26091001', amount: 1500 })).toBe('26091001_1500.00.pdf')
    expect(documentFileName({ number: '26091001', vendorName: 'สมชาย' })).toBe('26091001-สมชาย.pdf')
    expect(documentFileName({ number: '26091001' })).toBe('26091001.pdf')
  })

  it('always uses two decimals and no path separators', () => {
    const name = documentFileName({ number: 'RCT/001', vendorName: 'ก/ข', amount: 99.5 })
    expect(name).toBe('RCT-001-ก-ข_99.50.pdf')
    expect(name).not.toMatch(/[/\\]/)
  })
})

describe('contentDisposition', () => {
  it('emits an ASCII fallback plus an RFC 5987 filename*', () => {
    const h = contentDisposition('RCT-001-2569-001-สมชาย การ_5000.00.pdf')
    expect(h).toContain('attachment;')
    expect(h).toMatch(/filename="[^"]*\.pdf"/)
    // The fallback carries no Thai, and the starred form is percent-encoded.
    expect(/"filename="[^"]*[^\x00-\x7F]/.test(h)).toBe(false)
    expect(h).toMatch(/filename\*=UTF-8''/)
    expect(h).toContain('%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2')
  })
})
