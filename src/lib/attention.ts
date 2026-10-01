import type { PaymentTransaction, TxnStatus } from './types'

// "Needs attention" — the one thing a bookkeeping list cannot tell you on its
// own. The workflow is: create a draft → send a LINE link → the vendor signs →
// issue the receipt. Items rot silently in the middle of that pipeline, and
// the status badge looks identical on day 1 and day 30. This derives the
// actionable signal from the invite lifecycle so a stale row is obvious.
//
// Pure and driven by the explicit `sentAt`/`openedAt`/`expiresAt` fields, not
// by the Thai timeline labels, so the mock and the server agree.

export type AttentionKind = 'expired-link' | 'awaiting-vendor' | 'stale-draft' | 'missing-slip'
export type AttentionTone = 'warn' | 'danger'

export interface Attention {
  kind: AttentionKind
  label: string
  tone: AttentionTone
  /** Whole days since the row last moved, or since expiry. */
  days: number
}

export interface AttentionThresholds {
  /** A sent/opened link silent for this long needs chasing. */
  awaitingDays: number
  /** A draft untouched for this long was forgotten. */
  draftDays: number
}

export const DEFAULT_THRESHOLDS: AttentionThresholds = { awaitingDays: 3, draftDays: 3 }

/**
 * Statuses that mean "still moving, the vendor has not finished".
 * AWAITING / NEEDS_SLIP are exported so the SQL pushdown in
 * server/src/txn-sql.ts can build the identical predicate — the filter chip and
 * the row pills must never disagree about what "needs attention" means.
 */
export const AWAITING: TxnStatus[] = ['sent', 'opened']
/** Statuses where a missing slip blocks reconciliation or issuing. */
export const NEEDS_SLIP: TxnStatus[] = ['sent', 'opened', 'signed']

/** A whole day, matching the Bangkok wall calendar the app reports in. */
const DAY = 86400000

function daysSince(iso: string | undefined, today: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((today.getTime() - t) / DAY))
}

/**
 * The most pressing thing wrong with a row, or null when nothing is.
 * Priority: expired link → awaiting the vendor → forgotten draft → missing slip.
 */
export function attentionFor(
  t: PaymentTransaction,
  today: Date = new Date(),
  th: AttentionThresholds = DEFAULT_THRESHOLDS,
): Attention | null {
  if (t.status === 'expired') {
    const days = daysSince(t.expiresAt ?? t.sentAt ?? t.createdAt, today) ?? 0
    return { kind: 'expired-link', label: 'ลิงก์หมดอายุ', tone: 'danger', days }
  }

  if (AWAITING.includes(t.status)) {
    // Aging runs from the last thing the vendor actually did.
    const days = daysSince(t.openedAt ?? t.sentAt ?? t.createdAt, today) ?? 0
    if (days >= th.awaitingDays) {
      return { kind: 'awaiting-vendor', label: `รอผู้ขาย ${days} วัน`, tone: 'warn', days }
    }
    if (!t.slipReference) return { kind: 'missing-slip', label: 'ยังไม่แนบสลิป', tone: 'warn', days }
    return null
  }

  if (t.status === 'draft') {
    const days = daysSince(t.createdAt, today) ?? 0
    if (days >= th.draftDays) return { kind: 'stale-draft', label: `ร่างค้าง ${days} วัน`, tone: 'warn', days }
    return null
  }

  if (NEEDS_SLIP.includes(t.status) && !t.slipReference) {
    return { kind: 'missing-slip', label: 'ยังไม่แนบสลิป', tone: 'warn', days: 0 }
  }

  return null
}

/** How many rows in the set need attention — for the summary bar. */
export function countAttention(
  txns: PaymentTransaction[],
  today: Date = new Date(),
  th: AttentionThresholds = DEFAULT_THRESHOLDS,
): number {
  let n = 0
  for (const t of txns) if (attentionFor(t, today, th)) n++
  return n
}

