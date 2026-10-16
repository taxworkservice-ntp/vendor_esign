import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildReceiptPdf } from './pdf'

const base = {
  number: 'ABC-R-2569-0001',
  issueDate: '2026-09-28',
  verifyUrl: 'https://example.com/verify/DEADBEEF',
  verificationCode: 'DEADBEEF',
  verificationMethod: 'stub-deferred',
  consentVersion: 'v1',
  signedAt: '2026-09-28T10:00:00+07:00',
  authRef: 'AUTH-TESTREF',
  client: { code: 'ABC', display: 'ABC (pilot test)' },
  vendor: { prefix: 'นาย', name: 'สมชาย ใจดี', address: '12 ม.4 ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-4' },
  description: 'ค่าจ้างทำความสะอาดสำนักงาน ก.ย.',
  lineItems: [
    { description: 'ค่าจ้างทำความสะอาดสำนักงาน ก.ย.', amount: 2000 },
    { description: 'ค่าอะไหล่และวัสดุสิ้นเปลือง', amount: 1000 },
  ],
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
  it('paginates when there are many line items', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      description: `รายการที่ ${i + 1} — ค่าบริการพร้อมรายละเอียดยาวพอที่จะตัดบรรทัดได้`,
      amount: 250,
    }))
    const gross = 40 * 250
    const { bytes } = await buildReceiptPdf({
      ...base,
      lineItems: many,
      grossAmount: gross,
      whtRate: 3,
      whtAmount: gross * 0.03,
      netAmount: gross * 0.97,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  it('attaches the ID-card photo as a second page', async () => {
    // Canonical 1×1 PNG.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ])
    const one = await buildReceiptPdf(base)
    const two = await buildReceiptPdf({ ...base, idPhoto: png })
    expect((await PDFDocument.load(one.bytes)).getPageCount()).toBe(1)
    expect((await PDFDocument.load(two.bytes)).getPageCount()).toBe(2)
  })

  it('skips an unsupported ID-photo format (no second page)', async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    const { bytes } = await buildReceiptPdf({ ...base, idPhoto: webp })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
