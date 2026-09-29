// Dev helper: render sample receipts to storage/preview for eyeballing layout.
// Usage: npx tsx scripts/preview-receipt.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { buildReceiptPdf, type ReceiptPdfInput } from '../server/src/pdf'

const base: Omit<ReceiptPdfInput, 'lineItems'> = {
  number: 'ABC-R-2569-0001',
  issueDate: '2026-09-28',
  verifyUrl: 'https://example.com/verify/DEADBEEF',
  verificationCode: 'DEADBEEF',
  verificationMethod: 'stub-deferred',
  consentVersion: 'v1',
  signedAt: '2026-09-28T10:00:00+07:00',
  client: { code: 'ABC', display: 'บริษัท ตัวอย่าง จำกัด 99/1 ถ.สุขุมวิท กรุงเทพฯ 10110 เลขภาษี 0-1055-xxxxx-xx-x' },
  vendor: { name: 'สมชาย ใจดี', address: '12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-4' },
  description: 'ค่าซ่อมแอร์ 2 เครื่อง',
  grossAmount: 8500,
  whtRate: 3,
  whtAmount: 255,
  netAmount: 8245,
  amountWords: 'แปดพันสองร้อยสี่สิบห้าบาทถ้วน',
  transferDate: '2026-09-22',
  slipReference: 'TRF-881201',
}

mkdirSync('storage/preview', { recursive: true })

const two = await buildReceiptPdf({
  ...base,
  note: 'งานซ่อมบำรุงเครื่องปรับอากาศ',
  lineItems: [
    { description: 'ค่าซ่อมแอร์ 2 เครื่อง (ค่าบริการ)', amount: 5000 },
    { description: 'ค่าอะไหล่ R32', amount: 3500 },
  ],
})
writeFileSync('storage/preview/receipt-2items.pdf', two.bytes)

const many = Array.from({ length: 40 }, (_, i) => ({
  description: `รายการที่ ${i + 1} — ค่าบริการพร้อมรายละเอียดยาวพอสมควรเพื่อทดสอบการตัดบรรทัดบนตาราง`,
  amount: 250,
}))
const g = 10000
const multi = await buildReceiptPdf({ ...base, lineItems: many, grossAmount: g, whtAmount: g * 0.03, netAmount: g * 0.97 })
writeFileSync('storage/preview/receipt-40items.pdf', multi.bytes)

console.log('preview written: storage/preview/receipt-2items.pdf, storage/preview/receipt-40items.pdf')
