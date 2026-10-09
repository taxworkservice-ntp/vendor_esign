import { describe, expect, it } from 'vitest'
import { inviteAttention, isInviteExpired, type VendorInvite } from './vendor-invite'

const DAY = 86_400_000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()

const invite = (over: Partial<VendorInvite>): VendorInvite => ({
  id: 'vi-1',
  tenantId: 'ABC',
  status: 'invited',
  createdAt: iso(0),
  expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  ...over,
})

describe('inviteAttention', () => {
  it('flags an invite that was never opened after 7 days', () => {
    expect(inviteAttention(invite({ status: 'invited', createdAt: iso(8) })).level).toBe('followup')
    expect(inviteAttention(invite({ status: 'invited', createdAt: iso(2) })).level).toBe('ok')
  })

  it('flags an opened-but-not-submitted invite after 3 days', () => {
    expect(inviteAttention(invite({ status: 'opened', openedAt: iso(4) })).level).toBe('followup')
    expect(inviteAttention(invite({ status: 'opened', openedAt: iso(1) })).level).toBe('ok')
  })

  it('flags changes requested and not resubmitted after 3 days', () => {
    expect(inviteAttention(invite({ status: 'changes_requested', reviewedAt: iso(4) })).level).toBe('followup')
    expect(inviteAttention(invite({ status: 'changes_requested', reviewedAt: iso(1) })).level).toBe('ok')
  })

  it('never flags closed states', () => {
    for (const status of ['submitted', 'approved', 'rejected', 'expired', 'cancelled'] as const) {
      expect(inviteAttention(invite({ status, createdAt: iso(30) })).level).toBe('ok')
    }
  })
})

describe('isInviteExpired', () => {
  it('is true only for a live invite past its TTL', () => {
    expect(isInviteExpired(invite({ status: 'invited', expiresAt: iso(1) }))).toBe(true)
    expect(isInviteExpired(invite({ status: 'opened', expiresAt: iso(1) }))).toBe(true)
    expect(isInviteExpired(invite({ status: 'invited', expiresAt: iso(-1) }))).toBe(false)
    expect(isInviteExpired(invite({ status: 'submitted', expiresAt: iso(1) }))).toBe(false)
  })
})
