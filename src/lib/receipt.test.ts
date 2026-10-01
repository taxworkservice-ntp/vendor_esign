import { describe, expect, it } from 'vitest'
import { computeMetrics, maskVendorName, mockReceiptNumber, mockVerificationCode } from './receipt'
import type { PaymentTransaction } from './types'

const base: PaymentTransaction = {
  id: 'TX-T',
  tenantId: 'ABC',
  vendor: { id: 'v', name: 'สมชาย ใจดี', address: 'a', maskedId: 'm' },
  paymentType: 'ค่าบริการ',
  description: 'd',
  lineItems: [{ description: 'd', amount: 100 }],
  grossAmount: 100,
  whtRate: 3,
  whtMode: 'deduct',
  whtAmount: 3,
  netAmount: 97,
  transferDate: '2026-09-20',
  slipReference: 'S',
  slipName: 's.png',
  status: 'draft',
  createdAt: '2026-09-20T09:00:00+07:00',
  timeline: [],
  checks: [],
}

const txn = (id: string, status: PaymentTransaction['status'], tl: [string, string][]): PaymentTransaction => ({
  ...base,
  id,
  status,
  timeline: tl.map(([at, label]) => ({ at, label })),
})

describe('receipt helpers', () => {
  it('derives stable mock number + code', () => {
    expect(mockReceiptNumber('TX-1')).toBe(mockReceiptNumber('TX-1'))
    expect(mockVerificationCode('TX-1')).toMatch(/^[0-9A-F]{8}$/)
  })
  it('masks vendor name', () => {
    expect(maskVendorName('สมชาย ใจดี')).toBe('สม•• ••••')
  })
  it('computes pilot metrics incl. median hours to sign', () => {
    const txns = [
      txn('A', 'issued', [
        ['2026-09-20T09:00:00+07:00', 'สร้างรายการ'],
        ['2026-09-21T09:00:00+07:00', 'ส่งลิงก์ให้ผู้ขาย'],
        ['2026-09-21T12:00:00+07:00', 'ผู้ขายเปิดลิงก์'],
        ['2026-09-22T09:00:00+07:00', 'ผู้ขายลงนามรับเงินและมอบอำนาจ'],
      ]),
      txn('B', 'signed', [
        ['2026-09-20T09:00:00+07:00', 'สร้างรายการ'],
        ['2026-09-21T09:00:00+07:00', 'ส่งลิงก์ให้ผู้ขาย'],
        ['2026-09-25T09:00:00+07:00', 'ผู้ขายลงนามรับเงินและมอบอำนาจ'],
      ]),
      txn('C', 'expired', [['2026-09-20T09:00:00+07:00', 'สร้างรายการ']]),
    ]
    const m = computeMetrics(txns)
    expect(m).toEqual({ created: 3, linksOpened: 1, signed: 2, expired: 1, medianHoursToSign: 60 })
  })

  it('reads the exact labels the server timeline emits', () => {
    // server/src/transactions.ts builds these labels by hand. A rename there
    // silently zeroes linksOpened and medianHoursToSign here, so pin them.
    const labels = ['สร้างรายการ', 'ส่งลิงก์ให้ผู้ขาย', 'ผู้ขายเปิดลิงก์', 'ผู้ขายลงนามรับเงินและมอบอำนาจ', 'ออกใบเสร็จ', 'เพิกถอนลิงก์', 'ยกเลิกเอกสาร']
    const t = txn('X', 'issued', [
      ['2026-09-20T09:00:00+07:00', 'สร้างรายการ'],
      ['2026-09-21T09:00:00+07:00', 'ส่งลิงก์ให้ผู้ขาย'],
      ['2026-09-21T10:00:00+07:00', 'ผู้ขายเปิดลิงก์'],
      ['2026-09-21T19:00:00+07:00', 'ผู้ขายลงนามรับเงินและมอบอำนาจ'],
      ['2026-09-21T20:00:00+07:00', 'ออกใบเสร็จ'],
    ])
    expect(t.timeline.map((e) => e.label).every((l) => labels.includes(l))).toBe(true)
    const m = computeMetrics([t])
    expect(m.linksOpened).toBe(1)
    expect(m.signed).toBe(1)
    expect(m.medianHoursToSign).toBe(10)
  })

  it('ignores a timeline with unparseable timestamps rather than producing NaN', () => {
    const m = computeMetrics([txn('D', 'issued', [['not-a-date', 'ผู้ขายเปิดลิงก์']])])
    expect(m.linksOpened).toBe(0)
    expect(m.medianHoursToSign).toBeNull()
  })
})
