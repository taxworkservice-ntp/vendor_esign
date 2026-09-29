import { describe, expect, it } from 'vitest'
import { EDITABLE_PERMISSION_KEYS, hasPermission, normalizePermissions } from './permissions'

describe('permissions', () => {
  it('owner has everything implicitly; others are gated', () => {
    expect(hasPermission('owner', {}, 'canVoidDocuments')).toBe(true)
    expect(hasPermission('manager', { canVoidDocuments: true }, 'canVoidDocuments')).toBe(true)
    expect(hasPermission('officer', {}, 'canVoidDocuments')).toBe(false)
  })

  it('normalizes to known boolean keys only (drops canSendDocuments by default)', () => {
    const p = normalizePermissions({
      canManageCatalog: true,
      canSendDocuments: true, // legacy, not editable
      junk: true,
      canVoidDocuments: 'yes', // non-boolean dropped
    })
    expect(p).toEqual({ canManageCatalog: true })
  })

  it('expands legacy aliases when allowed', () => {
    const p = normalizePermissions({ canManageCustomers: true, canViewReports: true }, { allowLegacy: true })
    expect(p.canManageCustomers).toBe(true)
    expect(p.canViewCustomers).toBe(true)
    expect(p.canViewReports).toBe(true)
    expect(p.canExportReports).toBe(true)
  })

  it('exposes the editable key set without canSendDocuments', () => {
    expect(EDITABLE_PERMISSION_KEYS).not.toContain('canSendDocuments')
    expect(EDITABLE_PERMISSION_KEYS.length).toBeGreaterThan(10)
  })
})
