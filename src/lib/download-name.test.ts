import { describe, expect, it } from 'vitest'
import { downloadName, stamp } from './download-name'

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
    expect(name).toBe('receipt-A-B-RCT-001-2569.pdf')
    expect(name).not.toMatch(/[/\\]/)
  })
})
