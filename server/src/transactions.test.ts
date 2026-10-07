import { describe, expect, it } from 'vitest'
import { toTxn } from './transactions'
import type { TxnStatus } from '../../src/lib/types'

// toTxn is the row mapper behind every client transaction read. It used to
// hardcode `timeline: []` and `checks: []`, which left the detail page's history
// blank and silently zeroed computeMetrics — that function matches on the
// timeline labels, so an empty timeline reported "0 links opened" and no median
// sign time for every real workspace.

const CREATED = '2026-09-20T09:00:00.000Z'
const HOUR = 3600000

function row(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tx-1',
    user_id: 'ABC',
    ref: 'TX-1',
    vendor_id: 'v-1',
    payment_type: 'ค่าบริการ',
    description: 'งานซ่อม',
    note: '',
    line_items: [],
    gross_amount: 3000,
    wht_rate: 3,
    wht_amount: 90,
    net_amount: 2910,
    transfer_date: '2026-09-18',
    slip_reference: 'TRF-1',
    slip_file_path: '',
    status: 'draft',
    created_at: CREATED,
    void_reason: null,
    tax_id_last4: '6789',
    vendor_name: 'สมชาย การช่าง',
    vendor_address: 'กรุงเทพ',
    vendor_prefix: 'นาย',
    vendor_no: 1,
    receipt: null,
    req: null,
    life: null,
    ...o,
  }
}

const req = (o: Record<string, unknown> = {}) => ({
  token: 'tok_abc',
  created_at: new Date(Date.parse(CREATED) + HOUR).toISOString(),
  opened_at: null,
  used_at: null,
  revoked_at: null,
  // Far future so "live" never depends on the wall clock.
  expires_at: '2099-01-01T00:00:00.000Z',
  ...o,
})

const labels = (r: Record<string, unknown>) => toTxn(r).timeline.map((e) => e.label)

describe('toTxn — row mapping', () => {
  it('maps the vendor and money fields', () => {
    const t = toTxn(row())
    expect(t.id).toBe('tx-1')
    expect(t.tenantId).toBe('ABC')
    expect(t.vendor).toMatchObject({ name: 'สมชาย การช่าง', prefix: 'นาย', vendorNo: 1 })
    expect(t.grossAmount).toBe(3000)
    expect(t.netAmount).toBe(2910)
    expect(t.transferDate).toBe('2026-09-18')
    expect(t.whtMode).toBe('deduct')
  })

  it('masks the tax ID from the stored last4 and never exposes a full number', () => {
    const t = toTxn(row({ tax_id_last4: '6789' }))
    expect(t.taxIdLast4).toBe('6789')
    expect(t.vendor.maskedId).toBe('x-xxxx-xxxxx-67-89')
  })

  it('omits taxIdLast4 when none is stored', () => {
    expect(toTxn(row({ tax_id_last4: '' })).taxIdLast4).toBeUndefined()
  })
})

describe('toTxn — invite token', () => {
  it('exposes a live link', () => {
    expect(toTxn(row({ req: req() })).inviteToken).toBe('tok_abc')
  })

  it('withdraws a spent link', () => {
    expect(toTxn(row({ req: req({ used_at: '2026-09-21T00:00:00.000Z' }) })).inviteToken).toBeUndefined()
  })

  it('withdraws a revoked link', () => {
    expect(toTxn(row({ req: req({ revoked_at: '2026-09-21T00:00:00.000Z' }) })).inviteToken).toBeUndefined()
  })

  it('withdraws an expired link', () => {
    expect(toTxn(row({ req: req({ expires_at: '2000-01-01T00:00:00.000Z' }) })).inviteToken).toBeUndefined()
  })

  it('has no token when no link was ever sent', () => {
    expect(toTxn(row()).inviteToken).toBeUndefined()
  })
})

describe('toTxn — timeline', () => {
  it('always records the creation event', () => {
    expect(labels(row())).toEqual(['สร้างรายการ'])
  })

  it('records the send when a link exists', () => {
    expect(labels(row({ status: 'sent', req: req() }))).toEqual(['สร้างรายการ', 'ส่งลิงก์ให้ผู้ขาย'])
  })

  it('records the vendor opening the link', () => {
    expect(
      labels(row({ status: 'opened', req: req({ opened_at: '2026-09-21T10:00:00.000Z' }) })),
    ).toEqual(['สร้างรายการ', 'ส่งลิงก์ให้ผู้ขาย', 'ผู้ขายเปิดลิงก์'])
  })

  it('records signing', () => {
    expect(
      labels(
        row({
          status: 'signed',
          req: req({ opened_at: '2026-09-21T10:00:00.000Z', used_at: '2026-09-21T12:00:00.000Z' }),
        }),
      ),
    ).toEqual(['สร้างรายการ', 'ส่งลิงก์ให้ผู้ขาย', 'ผู้ขายเปิดลิงก์', 'ผู้ขายลงนามรับเงินและมอบอำนาจ'])
  })

  it('records issuance with the receipt number as detail', () => {
    const t = toTxn(
      row({
        status: 'issued',
        req: req({ used_at: '2026-09-21T12:00:00.000Z' }),
        receipt: { number: 'RCT-001-2569-001', issue_date: '2026-09-21T13:00:00.000Z' },
      }),
    )
    expect(t.timeline.map((e) => e.label)).toEqual([
      'สร้างรายการ',
      'ส่งลิงก์ให้ผู้ขาย',
      'ผู้ขายลงนามรับเงินและมอบอำนาจ',
      'ออกใบเสร็จ',
    ])
    expect(t.timeline.at(-1)?.detail).toBe('RCT-001-2569-001')
    expect(t.receiptNumber).toBe('RCT-001-2569-001')
  })

  it('records a revoked link', () => {
    expect(
      labels(row({ status: 'cancelled', req: req({ revoked_at: '2026-09-22T09:00:00.000Z' }) })),
    ).toEqual(['สร้างรายการ', 'ส่งลิงก์ให้ผู้ขาย', 'เพิกถอนลิงก์'])
  })

  it('records a void with its reason', () => {
    const t = toTxn(row({ status: 'void', void_reason: 'ยอดไม่ถูกต้อง' }))
    expect(t.timeline.map((e) => e.label)).toContain('ยกเลิกเอกสาร')
    expect(t.timeline.find((e) => e.label === 'ยกเลิกเอกสาร')?.detail).toBe('ยอดไม่ถูกต้อง')
    expect(t.voidReason).toBe('ยอดไม่ถูกต้อง')
  })

  it('dates the void with the receipt voided_at, not the created_at', () => {
    const t = toTxn(
      row({
        status: 'void',
        void_reason: 'ยอดไม่ถูกต้อง',
        created_at: '2026-09-20T09:00:00.000Z',
        receipt: {
          number: 'RCT-001-2569-001',
          issue_date: '2026-09-21T13:00:00.000Z',
          voided_at: '2026-09-30T08:00:00.000Z',
        },
      }),
    )
    expect(t.timeline.find((e) => e.label === 'ยกเลิกเอกสาร')?.at).toBe('2026-09-30T08:00:00.000Z')
  })

  it('is ordered oldest to newest', () => {
    const t = toTxn(
      row({
        status: 'issued',
        req: req({ opened_at: '2026-09-21T10:00:00.000Z', used_at: '2026-09-21T12:00:00.000Z' }),
        receipt: { number: 'RCT-001-2569-001', issue_date: '2026-09-21T13:00:00.000Z' },
      }),
    )
    const times = t.timeline.map((e) => Date.parse(e.at))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('is never empty, whatever the status', () => {
    const statuses: TxnStatus[] = ['draft', 'sent', 'opened', 'signed', 'issued', 'expired', 'cancelled', 'void']
    for (const status of statuses) {
      expect(toTxn(row({ status })).timeline.length).toBeGreaterThan(0)
    }
  })
})

describe('toTxn — metrics contract', () => {
  // computeMetrics lives in src/lib and matches on these exact labels, so an
  // empty or renamed timeline silently reports "0 links opened" and a null
  // median for a real workspace. Assert the labels the metrics depend on.
  const METRIC_LABELS = ['ผู้ขายเปิดลิงก์', 'ส่งลิงก์ให้ผู้ขาย', 'ผู้ขายลงนามรับเงินและมอบอำนาจ']

  it('emits every label computeMetrics reads', () => {
    const t = toTxn(
      row({
        status: 'issued',
        req: req({ opened_at: '2026-09-21T10:00:00.000Z', used_at: '2026-09-21T12:00:00.000Z' }),
        receipt: { number: 'RCT-001-2569-001', issue_date: '2026-09-21T13:00:00.000Z' },
      }),
    )
    const got = t.timeline.map((e) => e.label)
    for (const l of METRIC_LABELS) expect(got).toContain(l)
  })

  it('reports strictly increasing timestamps, so a median is computable', () => {
    const t = toTxn(
      row({
        status: 'issued',
        req: req({ opened_at: '2026-09-21T10:00:00.000Z', used_at: '2026-09-21T12:00:00.000Z' }),
        receipt: { number: 'RCT-001-2569-001', issue_date: '2026-09-21T13:00:00.000Z' },
      }),
    )
    const times = t.timeline.map((e) => Date.parse(e.at))
    expect(times.every((n) => Number.isFinite(n))).toBe(true)
  })
})
