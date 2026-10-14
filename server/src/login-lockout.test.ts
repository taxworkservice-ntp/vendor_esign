import { describe, expect, it } from 'vitest'
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILS, MAX_PASSWORD_LEN, lockoutUntil, nextLockout } from './shared'

// The per-email lockout is the account-level backstop behind the per-IP rate
// limits: 5 failures → 15 minutes. These are the pure decision functions both
// logins share (the Postgres IO around them is covered by the migration + the
// in-memory fallback contract, not by unit tests).

const NOW = 1_700_000_000_000

describe('login lockout policy', () => {
  it('keeps the balanced thresholds', () => {
    expect(LOGIN_MAX_FAILS).toBe(5)
    expect(LOGIN_LOCK_MS).toBe(15 * 60 * 1000)
    expect(MAX_PASSWORD_LEN).toBe(128)
  })

  it('lockoutUntil: unlocked without a record, below threshold, or expired', () => {
    expect(lockoutUntil(undefined, NOW)).toBe(0)
    expect(lockoutUntil({ n: 4, until: NOW + LOGIN_LOCK_MS }, NOW)).toBe(0)
    expect(lockoutUntil({ n: 5, until: NOW - 1 }, NOW)).toBe(0)
    expect(lockoutUntil({ n: 99, until: NOW - 1 }, NOW)).toBe(0)
  })

  it('lockoutUntil: locked at and above the threshold inside the window', () => {
    const until = NOW + LOGIN_LOCK_MS
    expect(lockoutUntil({ n: 5, until }, NOW)).toBe(until)
    expect(lockoutUntil({ n: 12, until }, NOW)).toBe(until)
  })

  it('nextLockout: counts up inside the window and restarts after expiry', () => {
    expect(nextLockout(undefined, NOW)).toEqual({ n: 1, until: NOW + LOGIN_LOCK_MS })
    expect(nextLockout({ n: 2, until: NOW + 1000 }, NOW)).toEqual({ n: 3, until: NOW + LOGIN_LOCK_MS })
    // An expired record restarts — a stale failure from last month never locks.
    expect(nextLockout({ n: 4, until: NOW - 1 }, NOW)).toEqual({ n: 1, until: NOW + LOGIN_LOCK_MS })
  })

  it('five consecutive failures lock, the fifth is the transition', () => {
    let rec = nextLockout(undefined, NOW)
    for (let i = 1; i < LOGIN_MAX_FAILS; i++) {
      expect(lockoutUntil(rec, NOW)).toBe(0)
      rec = nextLockout(rec, NOW)
    }
    expect(lockoutUntil(rec, NOW)).toBeGreaterThan(0)
  })
})
