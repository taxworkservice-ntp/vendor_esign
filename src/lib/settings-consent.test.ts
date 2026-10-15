import { describe, expect, it } from 'vitest'
import { CONSENT_SUMMARY, DEFAULT_CONSENT, DEFAULT_CONSENT_VERSION, PDPA_STATEMENT, consentVersionLabel, renderConsent } from './settings-types'

describe('vendor consent statement', () => {
  it('substitutes every variable and leaves no placeholder', () => {
    const out = renderConsent(DEFAULT_CONSENT, {
      client: 'บริษัท เอบีซี เซอร์วิส จำกัด',
      amount: '970.00',
      date: '9 ต.ค. 2569',
      ref: 'TX-1050',
      version: '2',
    })
    expect(out).toContain('บริษัท เอบีซี เซอร์วิส จำกัด')
    expect(out).toContain('970.00')
    expect(out).toContain('TX-1050')
    expect(out).not.toContain('{{')
  })

  it('carries the authorization and e-signature legal clauses', () => {
    expect(DEFAULT_CONSENT).toContain('สำหรับธุรกรรมนี้เท่านั้น')
    expect(DEFAULT_CONSENT).toContain('พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์')
    expect(PDPA_STATEMENT).toContain('คุ้มครองข้อมูลส่วนบุคคล')
    expect(DEFAULT_CONSENT_VERSION).toBe('2')
  })

  it('has a short summary distinct from the full statement', () => {
    expect(CONSENT_SUMMARY).toContain('{{client}}')
    expect(CONSENT_SUMMARY.length).toBeLessThan(DEFAULT_CONSENT.length)
  })
})

describe('consentVersionLabel', () => {
  it('normalises to exactly one leading v (never "vv1")', () => {
    expect(consentVersionLabel('2')).toBe('v2')
    expect(consentVersionLabel('v1')).toBe('v1')
    expect(consentVersionLabel('V2')).toBe('v2')
    expect(consentVersionLabel('vv1')).toBe('v1')
    expect(consentVersionLabel(' 3 ')).toBe('v3')
  })
  it('renders nothing for a missing version', () => {
    expect(consentVersionLabel('')).toBe('')
    expect(consentVersionLabel(undefined)).toBe('')
  })
})
