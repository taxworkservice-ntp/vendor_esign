import type { TransactionFilters } from './txn-filters'

// Persisted transaction-list preferences, per workspace.
//
// The status chips, sort and panel filters live in the URL so a view is
// shareable, but the sidebar link is a bare `/` — returning to the list reset
// them to defaults. Remember the *choices* (not the period, which the header
// month bar owns, and not the transient search) so a returning user lands back
// on the view they left. A URL with explicit params still wins (shared link).

const PREF_KEYS = ['status', 'paymentType', 'slip', 'minNet', 'maxNet', 'attention', 'sort'] as const
export type TxnPrefs = Pick<TransactionFilters, (typeof PREF_KEYS)[number]>

const key = (tenant: string): string => `tw:txn-prefs:${tenant}`

export function pickTxnPrefs(f: TransactionFilters): TxnPrefs {
  const out: Record<string, unknown> = {}
  for (const k of PREF_KEYS) out[k] = f[k]
  return out as TxnPrefs
}

export function readTxnPrefs(tenant: string): Partial<TxnPrefs> {
  try {
    const raw = localStorage.getItem(key(tenant))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of PREF_KEYS) if (k in parsed) out[k] = parsed[k]
    return out as Partial<TxnPrefs>
  } catch {
    return {}
  }
}

export function writeTxnPrefs(tenant: string, f: TransactionFilters): void {
  try {
    localStorage.setItem(key(tenant), JSON.stringify(pickTxnPrefs(f)))
  } catch {
    /* private mode / quota — preferences are best-effort */
  }
}
