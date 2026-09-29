import { describe, expect, it } from 'vitest'
import { buildVendorMemory, MEMORY_CATALOG_LIMIT } from './vendor-memory'
import type { PaymentTransaction, TxnStatus } from './types'

function txn(
  id: string,
  createdAt: string,
  lineItems: { description: string; amount: number }[],
  opts?: { status?: TxnStatus; vendorId?: string; paymentType?: string; whtRate?: number; note?: string; whtMode?: 'deduct' | 'grossup' },
): PaymentTransaction {
  const gross = lineItems.reduce((s, it) => s + it.amount, 0)
  return {
    id,
    tenantId: 'ABC',
    vendor: { id: opts?.vendorId ?? 'v1', name: 'V', address: 'a', maskedId: 'm' },
    paymentType: opts?.paymentType ?? 'ค่าบริการ',
    description: lineItems[0]?.description ?? '',
    note: opts?.note ?? '',
    lineItems,
    grossAmount: gross,
    whtRate: opts?.whtRate ?? 3,
    whtMode: opts?.whtMode ?? 'deduct',
    whtAmount: 0,
    netAmount: gross,
    transferDate: '2026-09-20',
    slipReference: '',
    slipName: '',
    status: opts?.status ?? 'issued',
    createdAt,
    timeline: [],
    checks: [],
  }
}

describe('buildVendorMemory', () => {
  it('returns empty for unknown vendor or no history', () => {
    expect(buildVendorMemory([], 'v1')).toEqual({ last: null, items: [] })
    expect(buildVendorMemory([txn('a', '2026-09-20T00:00:00Z', [{ description: 'x', amount: 1 }])], 'other').last).toBeNull()
  })

  it('picks the newest eligible transaction as last', () => {
    const txns = [
      txn('old', '2026-09-10T00:00:00Z', [{ description: 'เก่า', amount: 100 }], { paymentType: 'ค่าเช่า', whtRate: 5, note: 'n1' }),
      txn('new', '2026-09-20T00:00:00Z', [{ description: 'ใหม่', amount: 200 }], { paymentType: 'ค่าบริการ', whtRate: 3, note: 'n2' }),
    ]
    const m = buildVendorMemory(txns, 'v1')
    expect(m.last?.lineItems).toEqual([{ description: 'ใหม่', amount: 200 }])
    expect(m.last?.paymentType).toBe('ค่าบริการ')
    expect(m.last?.whtRate).toBe(3)
    expect(m.last?.note).toBe('n2')
  })

  it('excludes draft/void/cancelled from both last and catalog', () => {
    const txns = [
      txn('issued', '2026-09-15T00:00:00Z', [{ description: 'จ่ายจริง', amount: 100 }]),
      txn('voided', '2026-09-25T00:00:00Z', [{ description: 'ยกเลิก', amount: 999 }], { status: 'void' }),
      txn('draft', '2026-09-26T00:00:00Z', [{ description: 'ร่าง', amount: 5 }], { status: 'draft' }),
      txn('cancel', '2026-09-27T00:00:00Z', [{ description: 'ยกเลิกลิงก์', amount: 7 }], { status: 'cancelled' }),
    ]
    const m = buildVendorMemory(txns, 'v1')
    expect(m.last?.lineItems).toEqual([{ description: 'จ่ายจริง', amount: 100 }])
    expect(m.items.map((i) => i.description)).toEqual(['จ่ายจริง'])
  })

  it('aggregates near-duplicate descriptions and keeps the latest amount', () => {
    const txns = [
      txn('a', '2026-09-10T00:00:00Z', [{ description: 'ค่าจ้าง  ทำความสะอาด', amount: 100 }]),
      txn('b', '2026-09-20T00:00:00Z', [{ description: 'ค่าจ้าง ทำความสะอาด', amount: 150 }]),
      txn('c', '2026-09-22T00:00:00Z', [{ description: 'อื่น ๆ', amount: 50 }]),
    ]
    const m = buildVendorMemory(txns, 'v1')
    const washed = m.items.find((i) => i.description.startsWith('ค่าจ้าง'))
    expect(washed?.timesUsed).toBe(2)
    expect(washed?.lastAmount).toBe(150) // newest occurrence wins
  })

  it('sorts catalog by frequency then recency and caps length', () => {
    const txns: PaymentTransaction[] = []
    for (let i = 0; i < 3; i++) txns.push(txn(`x${i}`, `2026-09-1${i}T00:00:00Z`, [{ description: 'บ่อย', amount: 1 }]))
    txns.push(txn('once', '2026-09-30T00:00:00Z', [{ description: 'ครั้งเดียว', amount: 2 }]))
    for (let i = 0; i < 40; i++) txns.push(txn(`f${i}`, '2026-08-01T00:00:00Z', [{ description: `รายการ ${i}`, amount: 1 }]))
    const m = buildVendorMemory(txns, 'v1')
    expect(m.items[0].description).toBe('บ่อย')
    expect(m.items).toHaveLength(MEMORY_CATALOG_LIMIT)
  })

  it('remembers the last WHT mode for the vendor', () => {
    const txns = [txn('a', '2026-09-10T00:00:00Z', [{ description: 'x', amount: 100 }], { whtMode: 'grossup' })]
    expect(buildVendorMemory(txns, 'v1').last?.whtMode).toBe('grossup')
  })

  it('ignores zero/blank lines and falls back to legacy single line', () => {
    const legacy = { ...txn('legacy', '2026-09-20T00:00:00Z', []), lineItems: [], description: 'ค่าเก่า', grossAmount: 77 }
    const m = buildVendorMemory([legacy], 'v1')
    expect(m.last?.lineItems).toEqual([{ description: 'ค่าเก่า', amount: 77 }])
  })
})
