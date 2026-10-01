import { describe, expect, it } from 'vitest'
import { calcWhtAmount, filterWhtByMonth, formTypeForVendorType, nextWhtCertificateNo, splitTaxId, thaiBahtText } from './wht'

describe('wht helpers (host parity)', () => {
  it('maps vendor type → PND form', () => {
    expect(formTypeForVendorType('company')).toBe('pnd53')
    expect(formTypeForVendorType('individual')).toBe('pnd3')
  })

  it('generates YYMM + 3-digit sequence, incrementing per month', () => {
    expect(nextWhtCertificateNo([], '2026-09-18')).toBe('2609001')
    expect(nextWhtCertificateNo(['2609001', '2609002'], '2026-09-22')).toBe('2609003')
    expect(nextWhtCertificateNo(['2609005'], '2026-10-01')).toBe('2610001') // new month resets
  })

  it('computes WHT and formats helpers', () => {
    expect(calcWhtAmount(5000, 3)).toBe(150)
    expect(splitTaxId('1234567890123')).toContain('1')
    expect(thaiBahtText(150)).toContain('บาทถ้วน')
    expect(thaiBahtText(0)).toBe('ศูนย์บาทถ้วน')
  })

  it('filters WHT by issueDate month (not transferDate)', () => {
    const rows = [
      { issueDate: '2026-09-18' },
      { issueDate: '2026-09-30' },
      { issueDate: '2026-10-02' },
    ]
    expect(filterWhtByMonth(rows, '2026-09')).toEqual([{ issueDate: '2026-09-18' }, { issueDate: '2026-09-30' }])
    expect(filterWhtByMonth(rows, '2026-10')).toEqual([{ issueDate: '2026-10-02' }])
    expect(filterWhtByMonth(rows, '')).toEqual(rows)
  })
})
