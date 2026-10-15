import { describe, expect, it } from 'vitest'
import { canDo } from './data'
import type { Guarded } from './data'

// The portal capability gate. Pure given the guard result — no DB needed.
// Owners pass implicitly; everyone else needs the flag for the workspace.

function session(role: string, permissions: Record<string, boolean> = {}, ws = 'ABC'): Guarded {
  return {
    u: {
      userId: 'u-1',
      email: 'staff@client.co.th',
      mustChangePw: false,
      status: 'active',
      isPlatformAdmin: false,
      memberships: [{ tenantId: 'ABC', role, permissions }],
    },
    ws,
    impersonating: false,
    mode: 'write',
    actor: 'staff@client.co.th',
  }
}

describe('canDo', () => {
  it('denies errored guards and unknown workspaces', () => {
    expect(canDo({ error: 401 }, 'canManageTransactions')).toBe(false)
    expect(canDo({ error: 403 }, 'canManageTransactions')).toBe(false)
    expect(canDo(session('owner', {}, 'ZZZ'), 'canManageTransactions')).toBe(false)
  })

  it('owner passes every flag with no stored flags', () => {
    const g = session('owner')
    expect(canDo(g, 'canManageTransactions')).toBe(true)
    expect(canDo(g, 'canManageSettings')).toBe(true)
    expect(canDo(g, 'canVoidDocuments')).toBe(true)
    expect(canDo(g, 'canDeleteDocuments')).toBe(true)
  })

  it('explicit flags decide for staff', () => {
    const g = session('officer', { canManageTransactions: true })
    expect(canDo(g, 'canManageTransactions')).toBe(true)
    expect(canDo(g, 'canManageWht')).toBe(false)
    expect(canDo(g, 'canDeleteDocuments')).toBe(false)
  })

  it('empty flags fall back to role defaults (pre-backfill rows keep working)', () => {
    expect(canDo(session('manager'), 'canManageSettings')).toBe(true)
    expect(canDo(session('manager'), 'canDeleteDocuments')).toBe(false)
    expect(canDo(session('officer'), 'canManageTransactions')).toBe(true)
    expect(canDo(session('officer'), 'canManageWht')).toBe(false)
    expect(canDo(session('client_admin'), 'canManageSettings')).toBe(true)
    expect(canDo(session('client_user'), 'canManageTransactions')).toBe(true)
    expect(canDo(session('client_user'), 'canVoidDocuments')).toBe(false)
  })

  it('impersonation follows the mode, never the flags', () => {
    const read = { u: null, ws: 'ABC', impersonating: true, mode: 'read', actor: 'op' } as const
    const write = { u: null, ws: 'ABC', impersonating: true, mode: 'write', actor: 'op' } as const
    expect(canDo(read, 'canManageTransactions')).toBe(false)
    expect(canDo(write, 'canDeleteDocuments')).toBe(true)
  })
})
