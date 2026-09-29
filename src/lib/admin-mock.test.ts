import { describe, expect, it } from 'vitest'
import { loadTenants, loadTenantUsers } from './admin-mock'

describe('admin multi-client (mock slice)', () => {
  it('seeds pilot tenant ABC with separate series fields', () => {
    const t = loadTenants().find((x) => x.id === 'ABC')
    expect(t?.clientCode).toBe('ABC')
    expect(t?.beYear).toBe(2569)
    expect(t?.status).toBe('active')
  })
  it('seeds super_admin membership for ABC', () => {
    const users = loadTenantUsers()['ABC'] ?? []
    expect(users.some((u) => u.role === 'super_admin')).toBe(true)
  })
})
