import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ReceiptSheet, type ReceiptSheetData } from './receipt-sheet'

// The signing record is what makes a detached receipt checkable. These guard the
// wording/fields on the document itself (server PDF prints the same via
// server/src/pdf.ts).

function base(overrides: Partial<ReceiptSheetData> = {}): ReceiptSheetData {
  return {
    number: 'RCT-001-2569-001',
    transferDate: '2026-10-07',
    items: [{ description: 'ค่าบริการ', amount: 5000 }],
    grossAmount: 5000,
    whtRate: 3,
    whtAmount: 150,
    netAmount: 4850,
    client: { displayName: 'บริษัท ทดสอบ จำกัด', address: 'กรุงเทพฯ', taxId: '0105555555555' },
    vendor: { prefix: 'นาย', name: 'สมชาย ใจดี', address: 'ขอนแก่น', maskedId: 'x-xxxx-xxxxx-12-4' },
    sig: { kind: 'ready', png: 'data:image/png;base64,AAAA' },
    signedAt: '2026-10-07T14:32:00+07:00',
    sigMethod: 'typed-consent',
    verificationCode: 'DEADBEEF1234',
    verifyUrl: 'https://app.example.com/verify/DEADBEEF1234',
    ...overrides,
  }
}

describe('ReceiptSheet signing record', () => {
  it('prints the datetime, method, code and verify URL', () => {
    const html = renderToString(<ReceiptSheet data={base()} />)
    expect(html).toContain('ลงนามเมื่อ')
    expect(html).toContain('7 ต.ค. 2569 14:32')
    expect(html).toContain('ลงนามด้วยการพิมพ์ชื่อ')
    expect(html).toContain('รหัสตรวจสอบ')
    expect(html).toContain('DEADBEEF1234')
    expect(html).toContain('https://app.example.com/verify/DEADBEEF1234')
  })

  it('states the electronic-signature legal basis for a typed signature', () => {
    const html = renderToString(<ReceiptSheet data={base()} />)
    expect(html).toContain('ลายมือชื่ออิเล็กทรอนิกส์ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544')
    expect(html).toContain('ออกในนามผู้รับเงินโดยได้รับมอบอำนาจ')
  })

  it('states the legal basis for a drawn signature too', () => {
    const html = renderToString(<ReceiptSheet data={base({ sigMethod: 'stub-deferred' })} />)
    expect(html).toContain('ลายมือชื่ออิเล็กทรอนิกส์ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544')
    expect(html).toContain('ลายเซ็น (วาดด้วยนิ้ว/เมาส์)')
  })

  it('omits the legal line when unsigned', () => {
    const html = renderToString(<ReceiptSheet data={base({ sigMethod: undefined, signedAt: undefined })} />)
    expect(html).not.toContain('ลายมือชื่ออิเล็กทรอนิกส์')
  })

  it('omits the code and URL when there is none', () => {
    const html = renderToString(<ReceiptSheet data={base({ verificationCode: undefined, verifyUrl: undefined })} />)
    expect(html).not.toContain('รหัสตรวจสอบ')
    expect(html).not.toContain('/verify/')
  })
})
