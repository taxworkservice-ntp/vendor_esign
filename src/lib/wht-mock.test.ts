import { beforeEach, describe, expect, it } from 'vitest'
import { generateWhtForTxn, loadWht } from './wht-mock'
import type { PaymentTransaction } from './types'

class LS {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

const txn = (over: Partial<PaymentTransaction> = {}): PaymentTransaction => ({
  id: 'TX-1',
  tenantId: 'ABC',
  vendor: { id: 'v1', prefix: 'นาย', name: 'สมชาย การช่าง', address: 'ที่อยู่', maskedId: 'm', taxId: '1234567890123' },
  paymentType: 'ค่าบริการ',
  description: 'ค่าซ่อมแอร์',
  note: '',
  lineItems: [],
  grossAmount: 5000,
  whtRate: 3,
  whtMode: 'deduct',
  whtAmount: 150,
  netAmount: 4850,
  transferDate: '2026-09-18',
  slipReference: '',
  slipName: '',
  status: 'issued',
  createdAt: '2026-09-18T00:00:00Z',
  timeline: [],
  checks: [],
  ...over,
})

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: LS }).localStorage = new LS()
})

describe('auto WHT on issued receipt', () => {
  it('creates a pnd3 certificate for a personal vendor', () => {
    const rec = generateWhtForTxn(txn())
    expect(rec?.whtAmount).toBe(150)
    expect(rec?.formType).toBe('pnd3')
    expect(rec?.certificateNo).toBeTruthy()
    expect(loadWht('ABC').records.some((r) => r.sourceTransactionId === 'TX-1')).toBe(true)
  })

  it('uses pnd3 for every vendor in this individual-only app', () => {
    const rec = generateWhtForTxn(
      txn({ id: 'TX-2', vendor: { id: 'v2', prefix: '', name: 'บริษัท ซัพพลาย จำกัด', address: 'y', maskedId: 'm', taxId: '0105566000011' } }),
    )
    expect(rec?.formType).toBe('pnd3')
  })

  it('is idempotent — re-issuing does not duplicate', () => {
    generateWhtForTxn(txn())
    const before = loadWht('ABC').records.length
    expect(generateWhtForTxn(txn())).toBeNull()
    expect(loadWht('ABC').records.length).toBe(before)
  })

  it('skips when there is no withholding', () => {
    expect(generateWhtForTxn(txn({ whtAmount: 0 }))).toBeNull()
  })
})
