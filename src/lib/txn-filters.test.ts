import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  clampPage,
  currentMonth,
  defaultFilters,
  describeActiveFilters,
  emptyFilters,
  filterTransactions,
  isCustomRange,
  resolvePeriod,
  monthOffset,
  monthsOf,
  nextSort,
  pageCount,
  pageRange,
  presetRange,
  previousMonth,
  sortDir,
  sortField,
  sortTransactions,
  statusLabel,
  summarize,
  todayISO,
  type TransactionFilters,
} from './txn-filters'
import type { PaymentTransaction, TxnStatus } from './types'

function txn(id: string, transferDate: string, net: number, o?: Partial<PaymentTransaction>): PaymentTransaction {
  return {
    id,
    tenantId: 'ABC',
    vendor: { id: o?.vendor?.id ?? 'v1', name: o?.vendor?.name ?? 'V1', address: 'a', maskedId: 'm' },
    paymentType: o?.paymentType ?? 'ค่าบริการ',
    description: o?.description ?? 'desc',
    note: o?.note ?? '',
    lineItems: [{ description: 'x', amount: net }],
    grossAmount: net,
    whtRate: 0,
    whtMode: 'deduct',
    whtAmount: 0,
    netAmount: net,
    transferDate,
    slipReference: o?.slipReference ?? '',
    slipName: '',
    status: (o?.status ?? 'issued') as TxnStatus,
    createdAt: `${transferDate}T00:00:00+07:00`,
    timeline: [],
    checks: [],
    // Spread last so a fixture can override createdAt, status, timestamps, etc.
    ...o,
  }
}

const data = [
  txn('A', '2026-09-22', 3000, { paymentType: 'ค่าบริการ', slipReference: 'TRF-1', vendor: { id: 'v1', name: 'สมชาย', address: 'a', maskedId: 'm' } }),
  txn('B', '2026-09-10', 9000, { paymentType: 'ค่าเช่า', slipReference: '', status: 'draft', vendor: { id: 'v2', name: 'มาลี', address: 'a', maskedId: 'm' } }),
  txn('C', '2026-08-01', 1500, { paymentType: 'ค่าบริการ', slipReference: 'TRF-3', vendor: { id: 'v1', name: 'สมชาย', address: 'a', maskedId: 'm' } }),
]

const F = (o: Partial<TransactionFilters>): TransactionFilters => ({ ...emptyFilters(), ...o })

describe('filterTransactions', () => {
  it('filters by status, date range, month, type, slip, amount, vendor, search', () => {
    expect(filterTransactions(data, F({ status: 'draft' })).map((t) => t.id)).toEqual(['B'])
    expect(filterTransactions(data, F({ from: '2026-09-01' })).map((t) => t.id)).toEqual(['A', 'B'])
    expect(filterTransactions(data, F({ month: '2026-09' })).map((t) => t.id)).toEqual(['A', 'B'])
    expect(filterTransactions(data, F({ paymentType: 'ค่าบริการ' })).map((t) => t.id)).toEqual(['A', 'C'])
    expect(filterTransactions(data, F({ slip: 'without' })).map((t) => t.id)).toEqual(['B'])
    expect(filterTransactions(data, F({ slip: 'with' })).map((t) => t.id)).toEqual(['A', 'C'])
    expect(filterTransactions(data, F({ minNet: '2000' })).map((t) => t.id)).toEqual(['A', 'B'])
    expect(filterTransactions(data, F({ maxNet: '2000' })).map((t) => t.id)).toEqual(['C'])
    expect(filterTransactions(data, F({ vendorId: 'v1' })).map((t) => t.id)).toEqual(['A', 'C'])
    expect(filterTransactions(data, F({ search: 'มาลี' })).map((t) => t.id)).toEqual(['B'])
  })
  it('combines filters (AND)', () => {
    expect(filterTransactions(data, F({ month: '2026-09', paymentType: 'ค่าบริการ', slip: 'with' })).map((t) => t.id)).toEqual(['A'])
  })

  it('supports status groups (active / done / voided)', () => {
    const rows = [
      txn('draft', '2026-09-01', 1, { status: 'draft' }),
      txn('sent', '2026-09-01', 1, { status: 'sent' }),
      txn('signed', '2026-09-01', 1, { status: 'signed' }),
      txn('issued', '2026-09-01', 1, { status: 'issued' }),
      txn('void', '2026-09-01', 1, { status: 'void' }),
      txn('cancelled', '2026-09-01', 1, { status: 'cancelled' }),
    ]
    expect(filterTransactions(rows, F({ status: 'active' })).map((t) => t.id)).toEqual(['draft', 'sent', 'signed'])
    expect(filterTransactions(rows, F({ status: 'done' })).map((t) => t.id)).toEqual(['issued'])
    expect(filterTransactions(rows, F({ status: 'voided' })).map((t) => t.id)).toEqual(['void', 'cancelled'])
    expect(filterTransactions(rows, F({ status: 'sent' })).map((t) => t.id)).toEqual(['sent'])
  })
})

describe('defaults', () => {
  it('defaults the list to the current month', () => {
    const today = new Date(2026, 8, 29)
    expect(currentMonth(today)).toBe('2026-09')
    expect(defaultFilters(today).month).toBe('2026-09')
    expect(emptyFilters().month).toBe('')
  })

  it('computes previous month + offsets across year boundaries', () => {
    expect(previousMonth(new Date(2026, 8, 29))).toBe('2026-08')
    expect(previousMonth(new Date(2026, 0, 15))).toBe('2025-12')
    expect(monthOffset(1, new Date(2026, 11, 31))).toBe('2027-01')
  })

  it('returns today as local YYYY-MM-DD (wall calendar, not UTC)', () => {
    expect(todayISO(new Date(2026, 8, 29))).toBe('2026-09-29')
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayISO()).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  })
})

describe('sortTransactions', () => {
  it('sorts by date and net', () => {
    expect(sortTransactions(data, 'date-asc').map((t) => t.id)).toEqual(['C', 'B', 'A'])
    expect(sortTransactions(data, 'date-desc').map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(sortTransactions(data, 'net-desc').map((t) => t.id)).toEqual(['B', 'A', 'C'])
    expect(sortTransactions(data, 'net-asc').map((t) => t.id)).toEqual(['C', 'A', 'B'])
  })

  it('sorts by gross and withholding', () => {
    const rows = [
      { ...txn('A', '2026-09-01', 100), grossAmount: 100, whtAmount: 30 },
      { ...txn('B', '2026-09-01', 100), grossAmount: 500, whtAmount: 10 },
      { ...txn('C', '2026-09-01', 100), grossAmount: 300, whtAmount: 20 },
    ]
    expect(sortTransactions(rows, 'gross-desc').map((t) => t.id)).toEqual(['B', 'C', 'A'])
    expect(sortTransactions(rows, 'gross-asc').map((t) => t.id)).toEqual(['A', 'C', 'B'])
    expect(sortTransactions(rows, 'wht-desc').map((t) => t.id)).toEqual(['A', 'C', 'B'])
  })
})

describe('sort helpers', () => {
  it('parses field + direction', () => {
    expect(sortField('net-asc')).toBe('net')
    expect(sortDir('net-asc')).toBe('asc')
    expect(sortDir('date-desc')).toBe('desc')
  })
  it('toggles direction on the same column, defaults to desc on a new column', () => {
    expect(nextSort('date-desc', 'date')).toBe('date-asc')
    expect(nextSort('date-asc', 'date')).toBe('date-desc')
    expect(nextSort('date-desc', 'net')).toBe('net-desc')
    expect(nextSort('net-desc', 'gross')).toBe('gross-desc')
  })
})

describe('monthsOf', () => {
  it('lists distinct months desc', () => {
    expect(monthsOf(data)).toEqual(['2026-09', '2026-08'])
  })
})

describe('presetRange', () => {
  const today = new Date(2026, 8, 29) // 2026-09-29
  it('computes ranges', () => {
    expect(presetRange('7d', today)).toEqual({ from: '2026-09-23', to: '2026-09-29' })
    expect(presetRange('30d', today)).toEqual({ from: '2026-08-31', to: '2026-09-29' })
    expect(presetRange('month', today)).toEqual({ from: '2026-09-01', to: '2026-09-29' })
    expect(presetRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-09-29' })
  })
})

describe('sortTransactions — text columns', () => {
  it('sorts by vendor name using Thai collation', () => {
    const rows = [
      txn('A', '2026-09-01', 1, { vendor: { id: 'v1', name: 'กิตติ', address: 'a', maskedId: 'm' } }),
      txn('B', '2026-09-01', 1, { vendor: { id: 'v2', name: 'ขนิษฐ์', address: 'a', maskedId: 'm' } }),
      txn('C', '2026-09-01', 1, { vendor: { id: 'v3', name: 'ฉัตร', address: 'a', maskedId: 'm' } }),
    ]
    expect(sortTransactions(rows, 'vendor-asc').map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(sortTransactions(rows, 'vendor-desc').map((t) => t.id)).toEqual(['C', 'B', 'A'])
  })

  it('sorts by status using the Thai label', () => {
    const rows = [
      txn('draft', '2026-09-01', 1, { status: 'draft' }),
      txn('issued', '2026-09-01', 1, { status: 'issued' }),
      txn('sent', '2026-09-01', 1, { status: 'sent' }),
    ]
    // ฉบับร่าง < ส่งลิงก์แล้ว < ออกใบเสร็จแล้ว
    expect(sortTransactions(rows, 'status-asc').map((t) => t.id)).toEqual(['draft', 'sent', 'issued'])
  })

  it('breaks amount ties on id so paging is deterministic', () => {
    const rows = [txn('B', '2026-09-01', 100), txn('A', '2026-09-01', 100), txn('C', '2026-09-01', 100)]
    expect(sortTransactions(rows, 'net-desc').map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(sortTransactions(rows, 'net-asc').map((t) => t.id)).toEqual(['A', 'B', 'C'])
  })

  it('sorts by date with an id tiebreaker', () => {
    const rows = [txn('B', '2026-09-01', 1), txn('A', '2026-09-01', 1)]
    expect(sortTransactions(rows, 'date-asc').map((t) => t.id)).toEqual(['A', 'B'])
    expect(sortTransactions(rows, 'date-desc').map((t) => t.id)).toEqual(['A', 'B'])
  })
})

describe('summarize', () => {
  const withAmounts = (id: string, o: Partial<PaymentTransaction> & { gross: number; wht: number; net: number }) =>
    ({ ...txn(id, '2026-09-01', o.net, { status: o.status }), grossAmount: o.gross, whtAmount: o.wht, netAmount: o.net })

  it('returns zeroes for an empty set', () => {
    expect(summarize([])).toEqual({
      count: 0, gross: 0, wht: 0, net: 0,
      payableCount: 0, payableGross: 0, payableWht: 0, payableNet: 0,
      voidedCount: 0,
    })
  })

  it('sums gross/wht/net over every matching row', () => {
    const t = summarize([
      withAmounts('A', { gross: 1000, wht: 30, net: 970 }),
      withAmounts('B', { gross: 2000, wht: 100, net: 1900 }),
    ])
    expect(t.count).toBe(2)
    expect(t.gross).toBe(3000)
    expect(t.wht).toBe(130)
    expect(t.net).toBe(2870)
  })

  it('excludes cancelled and void from the payable figures but keeps them in the count', () => {
    const t = summarize([
      withAmounts('ok', { gross: 1000, wht: 30, net: 970, status: 'issued' }),
      withAmounts('cancelled', { gross: 500, wht: 0, net: 500, status: 'cancelled' }),
      withAmounts('void', { gross: 700, wht: 0, net: 700, status: 'void' }),
    ])
    expect(t.count).toBe(3)
    expect(t.voidedCount).toBe(2)
    expect(t.payableCount).toBe(1)
    expect(t.payableNet).toBe(970)
    expect(t.payableGross).toBe(1000)
    expect(t.payableWht).toBe(30)
  })

  it('keeps expired in the payable figures — the transfer still happened', () => {
    const t = summarize([withAmounts('exp', { gross: 900, wht: 27, net: 873, status: 'expired' })])
    expect(t.payableCount).toBe(1)
    expect(t.payableNet).toBe(873)
    expect(t.voidedCount).toBe(0)
  })

  it('keeps drafts pending and awaiting-vendor rows in the payable figures', () => {
    const t = summarize([
      withAmounts('draft', { gross: 100, wht: 0, net: 100, status: 'draft' }),
      withAmounts('sent', { gross: 200, wht: 6, net: 194, status: 'sent' }),
    ])
    expect(t.payableCount).toBe(2)
    expect(t.payableNet).toBe(294)
  })
})

describe('paging helpers', () => {
  it('computes the page count', () => {
    expect(pageCount(0, 50)).toBe(1)
    expect(pageCount(1, 50)).toBe(1)
    expect(pageCount(51, 50)).toBe(2)
    expect(pageCount(100, 50)).toBe(2)
    expect(pageCount(101, 50)).toBe(3)
  })

  it('clamps an out-of-range or negative page into the last valid page', () => {
    expect(clampPage(0, 101, 50)).toBe(0)
    expect(clampPage(2, 101, 50)).toBe(2)
    expect(clampPage(9, 101, 50)).toBe(2)
    expect(clampPage(-4, 101, 50)).toBe(0)
    expect(clampPage(0, 0, 50)).toBe(0)
  })

  it('reports the visible 1-based row range', () => {
    expect(pageRange(0, 50, 0)).toEqual({ from: 0, to: 0 })
    expect(pageRange(0, 50, 120)).toEqual({ from: 1, to: 50 })
    expect(pageRange(1, 50, 120)).toEqual({ from: 51, to: 100 })
    expect(pageRange(2, 50, 120)).toEqual({ from: 101, to: 120 })
  })
})

describe('active filter description', () => {
  it('lists nothing for a clean filter set', () => {
    expect(describeActiveFilters(F({}))).toEqual([])
    expect(activeFilterCount(F({}))).toBe(0)
  })

  it('describes every active filter in a stable order', () => {
    const d = describeActiveFilters(F({ search: ' สมชาย ', status: 'sent', from: '2026-09-01', to: '2026-09-30', paymentType: 'ค่าเช่า', slip: 'with', minNet: '100', maxNet: '900', vendorId: 'v1' }))
    expect(d.map((x) => x.key)).toEqual(['search', 'status', 'from', 'to', 'paymentType', 'slip', 'minNet', 'maxNet', 'vendorId'])
    expect(d[0].label).toBe('ค้นหา “สมชาย”')
    expect(d[1].label).toBe('สถานะ: ส่งลิงก์แล้ว')
    expect(d[5].label).toBe('สลิป: มีสลิป')
  })

  it('resolves the vendor name for the chip', () => {
    const d = describeActiveFilters(F({ vendorId: 'v1' }), { vendorName: (id) => (id === 'v1' ? 'สมชาย การช่าง' : id) })
    expect(d[0].label).toBe('ผู้ขาย: สมชาย การช่าง')
  })

  it('keeps the count and the chip list in agreement', () => {
    const f = F({ search: 'x', status: 'active', slip: 'without' })
    expect(activeFilterCount(f)).toBe(describeActiveFilters(f).length)
  })

  it('describes the attention filter', () => {
    expect(describeActiveFilters(F({ attention: true }))).toEqual([{ key: 'attention', label: 'ต้องติดตาม' }])
  })

  it('trims search so a stray space does not create a chip', () => {
    expect(describeActiveFilters(F({ search: '   ' }))).toEqual([])
  })
})

describe('attention filter', () => {
  const NOW = new Date('2026-09-30T09:00:00+07:00')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

  it('keeps only rows that need a human', () => {
    const rows = [
      txn('stale-sent', '2026-09-01', 1, { status: 'sent', createdAt: daysAgo(9) }),
      txn('fresh-sent', '2026-09-28', 1, { status: 'sent', createdAt: daysAgo(1), slipReference: 'TRF-9' }),
      txn('stale-draft', '2026-09-01', 1, { status: 'draft', createdAt: daysAgo(7) }),
      txn('done', '2026-09-01', 1, { status: 'issued', createdAt: daysAgo(30) }),
    ]
    // The fresh sent row is 1 day old and has a slip, so it needs nothing.
    expect(filterTransactions(rows, F({ attention: true }), { attentionThresholds: { awaitingDays: 3, draftDays: 3 }, today: NOW }).map((t) => t.id).sort()).toEqual(['stale-draft', 'stale-sent'])
  })

  it('includes a sent row with no slip even when it is fresh', () => {
    const rows = [txn('no-slip', '2026-09-28', 1, { status: 'sent', createdAt: daysAgo(1), slipReference: '' })]
    expect(filterTransactions(rows, F({ attention: true }), { attentionThresholds: { awaitingDays: 3, draftDays: 3 }, today: NOW }).map((t) => t.id)).toEqual(['no-slip'])
  })

  it('never filters anything when the flag is off', () => {
    const rows = [txn('a', '2026-09-01', 1, { status: 'issued' }), txn('b', '2026-09-01', 1, { status: 'draft', createdAt: daysAgo(30) })]
    expect(filterTransactions(rows, F({}))).toHaveLength(2)
  })

  it('combines with the other filters', () => {
    const rows = [
      txn('a', '2026-09-01', 1, { status: 'sent', createdAt: daysAgo(9) }),
      txn('b', '2026-08-01', 1, { status: 'sent', createdAt: daysAgo(9) }),
    ]
    const out = filterTransactions(rows, F({ attention: true, month: '2026-09' }), { attentionThresholds: { awaitingDays: 3, draftDays: 3 }, today: NOW })
    expect(out.map((t) => t.id)).toEqual(['a'])
  })
})

describe('resolvePeriod — the header period is the single source of truth', () => {
  it('takes the global month when the list has no custom range', () => {
    expect(resolvePeriod(F({ month: '2026-10' }), '2026-09')).toEqual({ month: '2026-09', from: '', to: '' })
  })

  it('adopts the global month even when the list was on a different month', () => {
    // The regression this replaces: the list used to ignore the header entirely
    // because its own month was always set, so changing the period did nothing.
    expect(resolvePeriod(F({ month: '2026-10' }), '2026-11').month).toBe('2026-11')
  })

  it('keeps a custom range on a plain re-render', () => {
    expect(resolvePeriod(F({ from: '2026-09-01', to: '2026-09-30' }), '2026-09')).toEqual({
      month: '',
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })

  it('lets an explicit header pick supersede a custom range', () => {
    expect(resolvePeriod(F({ from: '2026-01-01', to: '2026-01-31' }), '2026-09', { explicitPick: true })).toEqual({
      month: '2026-09',
      from: '',
      to: '',
    })
  })

  it('treats a half-open range as a range', () => {
    expect(resolvePeriod(F({ from: '2026-09-01' }), '2026-09')).toEqual({ month: '', from: '2026-09-01', to: '' })
  })

  it('handles the all-time period (empty global month)', () => {
    expect(resolvePeriod(F({}), '')).toEqual({ month: '', from: '', to: '' })
  })

  it('never reports the global month as a custom range', () => {
    expect(isCustomRange(F({ month: '2026-09' }))).toBe(false)
    expect(isCustomRange(F({}))).toBe(false)
  })

  it('detects a custom range', () => {
    expect(isCustomRange(F({ from: '2026-01-01' }))).toBe(true)
    expect(isCustomRange(F({ to: '2026-01-31' }))).toBe(true)
  })
})

describe('statusLabel', () => {
  it('labels groups, exact statuses and all', () => {
    expect(statusLabel('all')).toBe('ทั้งหมด')
    expect(statusLabel('active')).toBe('กำลังดำเนินการ')
    expect(statusLabel('done')).toBe('เสร็จสิ้น')
    expect(statusLabel('voided')).toBe('ยกเลิกเอกสาร')
    expect(statusLabel('needs-link')).toBe('ต้องส่งลิงก์')
    expect(statusLabel('awaiting')).toBe('รอลงนาม')
    expect(statusLabel('ready')).toBe('พร้อมออกใบเสร็จ')
    expect(statusLabel('draft')).toBe('ฉบับร่าง')
    expect(statusLabel('void')).toBe('ยกเลิกเอกสาร')
  })
})

describe('maker queue groups', () => {
  const NOW = new Date('2026-09-30T09:00:00+07:00')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()
  it('resolves needs-link / awaiting / ready', () => {
    const rows = [
      txn('draft', '2026-09-01', 1, { status: 'draft' }),
      txn('expired', '2026-09-01', 1, { status: 'expired' }),
      txn('cancelled', '2026-09-01', 1, { status: 'cancelled' }),
      txn('sent', '2026-09-01', 1, { status: 'sent' }),
      txn('opened', '2026-09-01', 1, { status: 'opened' }),
      txn('signed', '2026-09-01', 1, { status: 'signed' }),
      txn('issued', '2026-09-01', 1, { status: 'issued' }),
    ]
    expect(filterTransactions(rows, F({ status: 'needs-link' })).map((t) => t.id)).toEqual(['draft', 'expired', 'cancelled'])
    expect(filterTransactions(rows, F({ status: 'awaiting' })).map((t) => t.id)).toEqual(['sent', 'opened'])
    expect(filterTransactions(rows, F({ status: 'ready' })).map((t) => t.id)).toEqual(['signed'])
  })

  it('sorts the queue most-urgent first', () => {
    const rows = [
      txn('fresh-draft', '2026-09-29', 1, { status: 'draft', createdAt: daysAgo(1) }),
      txn('old-wait', '2026-09-01', 1, { status: 'sent', createdAt: daysAgo(9), sentAt: daysAgo(9), slipReference: 'TRF-1' }),
      txn('expired', '2026-09-01', 1, { status: 'expired', createdAt: daysAgo(9) }),
      txn('done', '2026-09-01', 1, { status: 'issued', createdAt: daysAgo(9) }),
    ]
    expect(sortTransactions(rows, 'urgency-desc', NOW).map((t) => t.id)).toEqual(['expired', 'old-wait', 'fresh-draft', 'done'])
  })

  it('finds a receipt number from paper', () => {
    const rows = [
      txn('a', '2026-09-01', 1, { receiptNumber: 'RCT-002-2569-001' }),
      txn('b', '2026-09-01', 1, { receiptNumber: 'RCT-003-2569-007' }),
    ]
    expect(filterTransactions(rows, F({ search: 'RCT-003' })).map((t) => t.id)).toEqual(['b'])
  })
})
