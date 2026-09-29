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
        ['2026-09-22T09:00:00+07:00', 'ผู้ขายเซ็นรับเงิน + มอบอำนาจ'],
      ]),
      txn('B', 'signed', [
        ['2026-09-20T09:00:00+07:00', 'สร้างรายการ'],
        ['2026-09-21T09:00:00+07:00', 'ส่งลิงก์ให้ผู้ขาย'],
        ['2026-09-25T09:00:00+07:00', 'ผู้ขายเซ็นรับเงิน + มอบอำนาจ'],
      ]),
      txn('C', 'expired', [['2026-09-20T09:00:00+07:00', 'สร้างรายการ']]),
    ]
    const m = computeMetrics(txns)
    expect(m).toEqual({ created: 3, linksOpened: 1, signed: 2, expired: 1, medianHoursToSign: 60 })
  })
})
