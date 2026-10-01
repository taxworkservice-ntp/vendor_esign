import { describe, expect, it } from 'vitest'
import { attentionFor, countAttention, DEFAULT_THRESHOLDS } from './attention'
import type { PaymentTransaction, TxnStatus } from './types'

const TODAY = new Date('2026-09-30T09:00:00+07:00')

function daysAgo(n: number): string {
  return new Date(TODAY.getTime() - n * 86400000).toISOString()
}

function txn(o: Partial<PaymentTransaction> & Pick<PaymentTransaction, 'status'>): PaymentTransaction {
  return {
    id: 'TX-1',
    tenantId: 'ABC',
    vendor: { id: 'v1', name: 'สมชาย', address: 'a', maskedId: 'x' },
    paymentType: 'ค่าบริการ',
    description: 'd',
    note: '',
    lineItems: [{ description: 'x', amount: 100 }],
    grossAmount: 100,
    whtRate: 0,
    whtMode: 'deduct',
    whtAmount: 0,
    netAmount: 100,
    transferDate: '2026-09-01',
    slipReference: 'TRF-1',
    slipName: '',
    createdAt: daysAgo(0),
    timeline: [],
    checks: [],
    ...o,
  }
}

describe('attentionFor', () => {
  it('ignores healthy rows', () => {
    expect(attentionFor(txn({ status: 'issued' }), TODAY)).toBeNull()
    expect(attentionFor(txn({ status: 'signed' }), TODAY)).toBeNull()
    expect(attentionFor(txn({ status: 'void' }), TODAY)).toBeNull()
    expect(attentionFor(txn({ status: 'cancelled' }), TODAY)).toBeNull()
  })

  it('flags an expired link as urgent and days it has been dead', () => {
    const a = attentionFor(txn({ status: 'expired', sentAt: daysAgo(12), expiresAt: daysAgo(5) }), TODAY)
    expect(a).toMatchObject({ kind: 'expired-link', tone: 'danger', days: 5 })
  })

  it('flags a link the vendor has not answered after the threshold', () => {
    const a = attentionFor(txn({ status: 'sent', sentAt: daysAgo(5) }), TODAY)
    expect(a).toMatchObject({ kind: 'awaiting-vendor', tone: 'warn', days: 5 })
    expect(a?.label).toBe('รอผู้ขาย 5 วัน')
  })

  it('ages from the last vendor action, not the send time', () => {
    // Sent 10 days ago but opened 1 day ago — the vendor is engaged, so this
    // is not yet a chase-worthy row.
    const fresh = attentionFor(txn({ status: 'opened', sentAt: daysAgo(10), openedAt: daysAgo(1) }), TODAY)
    expect(fresh).toBeNull()
    // Same send time, but the open is old too.
    const stale = attentionFor(txn({ status: 'opened', sentAt: daysAgo(10), openedAt: daysAgo(6) }), TODAY)
    expect(stale).toMatchObject({ kind: 'awaiting-vendor', days: 6 })
  })

  it('does not flag a link inside the threshold', () => {
    expect(attentionFor(txn({ status: 'sent', sentAt: daysAgo(2) }), TODAY)).toBeNull()
    expect(attentionFor(txn({ status: 'opened', sentAt: daysAgo(2), openedAt: daysAgo(2) }), TODAY)).toBeNull()
  })

  it('flags an old draft but not a fresh one', () => {
    expect(attentionFor(txn({ status: 'draft', createdAt: daysAgo(1) }), TODAY)).toBeNull()
    expect(attentionFor(txn({ status: 'draft', createdAt: daysAgo(6) }), TODAY)).toMatchObject({ kind: 'stale-draft', days: 6 })
  })

  it('never flags a draft for a missing slip — it is still being composed', () => {
    expect(attentionFor(txn({ status: 'draft', createdAt: daysAgo(0), slipReference: '' }), TODAY)).toBeNull()
  })

  it('flags a sent row with no slip once it is not already chasing the vendor', () => {
    const a = attentionFor(txn({ status: 'sent', sentAt: daysAgo(1), slipReference: '' }), TODAY)
    expect(a).toMatchObject({ kind: 'missing-slip', tone: 'warn' })
  })

  it('flags a signed row with no slip — issuing needs reconciliation', () => {
    expect(attentionFor(txn({ status: 'signed', slipReference: '' }), TODAY)).toMatchObject({ kind: 'missing-slip' })
  })

  it('prefers the more urgent signal when several apply', () => {
    // Old, no slip, and the link has lapsed: expiry wins.
    const a = attentionFor(txn({ status: 'expired', sentAt: daysAgo(30), slipReference: '' }), TODAY)
    expect(a?.kind).toBe('expired-link')
  })

  it('honours custom thresholds', () => {
    const t = txn({ status: 'sent', sentAt: daysAgo(3) })
    expect(attentionFor(t, TODAY, DEFAULT_THRESHOLDS)).not.toBeNull()
    expect(attentionFor(t, TODAY, { awaitingDays: 7, draftDays: 7 })).toBeNull()
  })

  it('never reports negative days for a future timestamp', () => {
    const a = attentionFor(txn({ status: 'sent', sentAt: new Date(TODAY.getTime() + 86400000).toISOString() }), TODAY)
    // Future send is inside the threshold, so nothing to chase yet.
    expect(a).toBeNull()
    const e = attentionFor(txn({ status: 'expired', expiresAt: new Date(TODAY.getTime() + 86400000).toISOString() }), TODAY)
    expect(e?.days).toBe(0)
  })

  it('falls back to createdAt when the lifecycle timestamps are missing', () => {
    const a = attentionFor(txn({ status: 'sent', createdAt: daysAgo(8), sentAt: undefined }), TODAY)
    expect(a).toMatchObject({ kind: 'awaiting-vendor', days: 8 })
  })

  it('ignores an unparseable timestamp instead of throwing', () => {
    const a = attentionFor(txn({ status: 'sent', sentAt: 'not-a-date' }), TODAY)
    // Falls through to createdAt (today), so nothing to flag.
    expect(a).toBeNull()
  })
})

describe('countAttention', () => {
  it('counts only the rows that need something', () => {
    const rows: PaymentTransaction[] = [
      txn({ id: 'a', status: 'issued' }),
      txn({ id: 'b', status: 'sent', sentAt: daysAgo(6) }),
      txn({ id: 'c', status: 'draft', createdAt: daysAgo(9) }),
      txn({ id: 'd', status: 'expired', expiresAt: daysAgo(2) }),
      txn({ id: 'e', status: 'opened', sentAt: daysAgo(1) }),
    ]
    expect(countAttention(rows, TODAY)).toBe(3)
  })

  it('is zero for an empty or healthy set', () => {
    expect(countAttention([], TODAY)).toBe(0)
    expect(countAttention([txn({ status: 'issued' })], TODAY)).toBe(0)
  })
})

describe('status coverage', () => {
  it('has a rule for every status the list can show', () => {
    const all: TxnStatus[] = ['draft', 'sent', 'opened', 'signed', 'issued', 'expired', 'cancelled', 'void']
    for (const s of all) {
      // Must not throw for any status.
      expect(() => attentionFor(txn({ status: s, sentAt: daysAgo(99), createdAt: daysAgo(99), slipReference: '' }), TODAY)).not.toThrow()
    }
  })
})
