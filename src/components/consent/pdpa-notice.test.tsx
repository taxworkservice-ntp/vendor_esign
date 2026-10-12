import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PdpaNotice } from './pdpa-notice'

// One shared disclosure used by the signing screen and the self-onboarding
// page — the label and the statement must both reach the vendor.
describe('PdpaNotice', () => {
  it('renders the summary label and the statement text', () => {
    const html = renderToString(<PdpaNotice text="ข้อความความเป็นส่วนตัว" />)
    expect(html).toContain('ประกาศความเป็นส่วนตัว (PDPA)')
    expect(html).toContain('ข้อความความเป็นส่วนตัว')
  })

  it('renders the optional detail block', () => {
    const html = renderToString(<PdpaNotice text="หลัก" detail={<p>ข้อมูลที่เก็บ: ชื่อ</p>} />)
    expect(html).toContain('ข้อมูลที่เก็บ: ชื่อ')
  })
})
