import { describe, expect, it } from 'vitest'
import { ADMIN_ROLES, CLIENT_ROLES, findMockUser, hasRole, MOCK_PASSWORD } from './mock-users'

describe('mock credentials (dev only)', () => {
  it('accepts the correct email + password (case-insensitive email)', () => {
    const u = findMockUser('CLIENT@taxwork.local', MOCK_PASSWORD)
    expect(u?.email).toBe('client@taxwork.local')
    // one client user = one company
    expect(u?.memberships.map((m) => m.tenantId)).toEqual(['ABC'])
  })

  it('rejects a wrong password or unknown email', () => {
    expect(findMockUser('client@taxwork.local', 'nope')).toBeNull()
    expect(findMockUser('nobody@nowhere', MOCK_PASSWORD)).toBeNull()
  })

  it('routes client vs admin roles', () => {
    const client = findMockUser('client@taxwork.local', MOCK_PASSWORD)!
    const admin = findMockUser('admin@taxwork.local', MOCK_PASSWORD)!
    expect(hasRole(client, CLIENT_ROLES)).toBe(true)
    expect(hasRole(client, ADMIN_ROLES)).toBe(false)
    expect(hasRole(admin, ADMIN_ROLES)).toBe(true)
    expect(hasRole(admin, CLIENT_ROLES)).toBe(false)
  })
})
