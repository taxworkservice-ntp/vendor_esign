import { describe, expect, it } from 'vitest'
import { buildReceiptPdf } from './pdf'

const base = {
  number: 'ABC-R-2569-0001',
  issueDate: '2026-09-28',
  verifyUrl: 'https://example.com/verify/DEADBEEF',
  verificationCode: 'DEADBEEF',
  verificationMethod: 'stub-deferred',
  consentVersion: 'v1',
  signedAt: '2026-09-28T10:00:00+07:00',
  client: { code: 'ABC', display: 'ABC (pilot test)' },
  vendor: { name: 'สมชาย ใจดี', address: '12 ม.4 ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-4' },
  description: 'ค่าจ้างทำความสะอาดสำนักงาน ก.ย.',
  grossAmount: 3000,
  whtRate: 3,
  whtAmount: 90,
  netAmount: 2910,
  amountWords: 'สองพันเก้าร้อยสิบบาทถ้วน',
  transferDate: '2026-09-22',
  slipReference: 'TRF-881201',
}

describe('server receipt PDF', () => {
  it('builds a valid PDF with SHA-256', async () => {
    const { bytes, sha256 } = await buildReceiptPdf(base)
    const head = Buffer.from(bytes.slice(0, 5)).toString('ascii')
    expect(head).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(20000) // embedded Sarabun subset + QR
    expect(sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('works without a signature image', async () => {
    const { bytes } = await buildReceiptPdf({ ...base, whtRate: 0, whtAmount: 0 })
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-')
  })
})
