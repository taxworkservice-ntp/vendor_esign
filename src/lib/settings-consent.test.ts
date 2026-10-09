import { describe, expect, it } from 'vitest'
import { DEFAULT_CONSENT, DEFAULT_CONSENT_VERSION, PDPA_STATEMENT, renderConsent } from './settings-types'

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
})
