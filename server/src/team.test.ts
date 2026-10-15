import { describe, expect, it } from 'vitest'
import { checkTeamEdit } from './team'

// Owner-only flag editing: the client has no role-writing route, so these
// guardrails are the whole access model for the team section. Pure function —
// no DB needed.

const OWNER = { userId: 'u-owner', role: 'owner' }
const MANAGER = { userId: 'u-manager', role: 'manager' }
const OFFICER = { userId: 'u-officer', role: 'officer' }

describe('checkTeamEdit', () => {
  it('owner may edit manager/officer flags; flags are normalized', () => {
    const r = checkTeamEdit(OWNER, MANAGER, {
      permissions: { canVoidDocuments: true, junk: true, canManageWht: 'yes' },
    })
    expect(r).toEqual({ ok: true, permissions: { canVoidDocuments: true } })
  })

  it('legacy staff roles are editable like their modern equivalents', () => {
    expect(checkTeamEdit(OWNER, { userId: 'u1', role: 'client_user' }, { permissions: {} }).ok).toBe(true)
    expect(checkTeamEdit(OWNER, { userId: 'u1', role: 'client_admin' }, { permissions: {} }).ok).toBe(true)
  })

  it('non-owners are rejected before anything else', () => {
    expect(checkTeamEdit(null, MANAGER, { permissions: {} })).toEqual({ ok: false, error: 'forbidden' })
    expect(checkTeamEdit({ userId: 'u-m', role: 'manager' }, OFFICER, { permissions: {} }))
      .toEqual({ ok: false, error: 'forbidden' })
    expect(checkTeamEdit({ userId: 'u-o', role: 'officer' }, OFFICER, { permissions: {} }))
      .toEqual({ ok: false, error: 'forbidden' })
  })

  it('missing targets are 404, self and owners are 403', () => {
    expect(checkTeamEdit(OWNER, undefined, { permissions: {} })).toEqual({ ok: false, error: 'not-found' })
    expect(checkTeamEdit(OWNER, OWNER, { permissions: {} })).toEqual({ ok: false, error: 'forbidden-self' })
    expect(checkTeamEdit(OWNER, { userId: 'u-o2', role: 'owner' }, { permissions: {} }))
      .toEqual({ ok: false, error: 'forbidden-role' })
    expect(checkTeamEdit(OWNER, { userId: 'u-s', role: 'super_admin' }, { permissions: {} }))
      .toEqual({ ok: false, error: 'forbidden-role' })
    expect(checkTeamEdit(OWNER, { userId: 'u-b', role: 'bookkeeper' }, { permissions: {} }))
      .toEqual({ ok: false, error: 'forbidden-role' })
  })

  it('only an exact { permissions } body is accepted', () => {
    expect(checkTeamEdit(OWNER, MANAGER, { permissions: {}, role: 'officer' }))
      .toEqual({ ok: false, error: 'invalid-body' })
    expect(checkTeamEdit(OWNER, MANAGER, { permissions: {}, status: 'disabled' }))
      .toEqual({ ok: false, error: 'invalid-body' })
    expect(checkTeamEdit(OWNER, MANAGER, {})).toEqual({ ok: false, error: 'invalid-body' })
    expect(checkTeamEdit(OWNER, MANAGER, null)).toEqual({ ok: false, error: 'invalid-body' })
    expect(checkTeamEdit(OWNER, MANAGER, [{ permissions: {} }])).toEqual({ ok: false, error: 'invalid-body' })
  })
})
