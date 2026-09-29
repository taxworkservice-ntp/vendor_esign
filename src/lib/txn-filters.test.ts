import { describe, expect, it } from 'vitest'
import { currentMonth, defaultFilters, emptyFilters, filterTransactions, monthsOf, presetRange, sortTransactions, type TransactionFilters } from './txn-filters'
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
})

describe('sortTransactions', () => {
  it('sorts by date and net', () => {
    expect(sortTransactions(data, 'date-asc').map((t) => t.id)).toEqual(['C', 'B', 'A'])
    expect(sortTransactions(data, 'date-desc').map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(sortTransactions(data, 'net-desc').map((t) => t.id)).toEqual(['B', 'A', 'C'])
    expect(sortTransactions(data, 'net-asc').map((t) => t.id)).toEqual(['C', 'A', 'B'])
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
