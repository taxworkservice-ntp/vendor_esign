import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SubmissionEvidence } from './submission-evidence'

const data = {
  inviteRef: 'VN-3F9A21C4',
  submittedAt: '2026-10-12T12:00:00.000Z',
  consentVersion: 'vendor-onboard-v2',
  docs: { id: true, bank: false },
  clientName: 'ABC Accounting Co., Ltd.',
  draft: {
    prefix: 'นาย',
    name: 'สมชาย ใจดี',
    address: '123 ถนนทดสอบ ตำบลทดสอบ',
    taxId: '1101700230708',
    bankName: 'กสิกรไทย',
    bankAccount: '1234567890',
    accountHolder: 'สมชาย ใจดี',
  },
}

// The vendor's proof-of-submission card: it must carry the reference, the
// submitted details, and the download affordance.
describe('SubmissionEvidence', () => {
  it('renders the reference and submitted details', () => {
    const html = renderToString(<SubmissionEvidence data={data} />)
    expect(html).toContain('หลักฐานการส่งข้อมูลผู้ขาย')
    expect(html).toContain('VN-3F9A21C4')
    expect(html).toContain('สมชาย ใจดี')
    expect(html).toContain('1-1017-00230-70-8') // grouped tax ID
    expect(html).toContain('1234567890')
    expect(html).toContain('ABC Accounting Co., Ltd.')
    expect(html).toContain('ดาวน์โหลด PDF')
  })

  it('lists only the ID card when no bank-book page was attached', () => {
    const html = renderToString(<SubmissionEvidence data={data} />)
    expect(html).toContain('บัตรประชาชน (แนบ)')
    expect(html).not.toContain('หน้าสมุดบัญชี')
  })

  it('lists the bank-book page when one was attached', () => {
    const html = renderToString(<SubmissionEvidence data={{ ...data, docs: { id: true, bank: true } }} />)
    expect(html).toContain('หน้าสมุดบัญชี (แนบ)')
  })
})
