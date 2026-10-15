import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGER_PERMS,
  DEFAULT_OFFICER_PERMS,
  PERMISSION_KEYS,
  PERMISSION_META,
  defaultPermissionsFor,
  hasPermission,
  normalizePermissions,
} from './permissions'

describe('workspace permissions', () => {
  it('owner has everything implicitly; others are strictly flag-driven', () => {
    expect(hasPermission('owner', {}, 'canDeleteDocuments')).toBe(true)
    expect(hasPermission('owner', undefined, 'canManageSettings')).toBe(true)
    expect(hasPermission('manager', { canVoidDocuments: true }, 'canVoidDocuments')).toBe(true)
    expect(hasPermission('manager', {}, 'canVoidDocuments')).toBe(false)
    expect(hasPermission('officer', {}, 'canManageTransactions')).toBe(false)
    expect(hasPermission('officer', undefined, 'canManageTransactions')).toBe(false)
  })

  it('normalizes to known boolean keys only', () => {
    const p = normalizePermissions({
      canManageCatalog: true,
      canVoidDocuments: false,
      junk: true,
      canManageWht: 'yes', // non-boolean dropped
    })
    expect(p).toEqual({ canManageCatalog: true, canVoidDocuments: false })
  })

  it('normalizes garbage to empty', () => {
    expect(normalizePermissions(null)).toEqual({})
    expect(normalizePermissions(undefined)).toEqual({})
    expect(normalizePermissions(['canManageCatalog'])).toEqual({})
    expect(normalizePermissions('owner')).toEqual({})
  })

  it('role defaults match the locked spec (manager broad, officer daily, catalog owner-only)', () => {
    expect(defaultPermissionsFor('manager')).toEqual(DEFAULT_MANAGER_PERMS)
    expect(defaultPermissionsFor('officer')).toEqual(DEFAULT_OFFICER_PERMS)
    expect(DEFAULT_MANAGER_PERMS.canDeleteDocuments).toBeUndefined()
    expect(DEFAULT_MANAGER_PERMS.canManageCatalog).toBeUndefined()
    expect(DEFAULT_OFFICER_PERMS.canManageWht).toBeUndefined()
    expect(DEFAULT_OFFICER_PERMS.canManageSettings).toBeUndefined()
    expect(DEFAULT_OFFICER_PERMS.canManageCatalog).toBeUndefined()
    expect(DEFAULT_OFFICER_PERMS.canVoidDocuments).toBeUndefined()
    expect(DEFAULT_OFFICER_PERMS.canDeleteDocuments).toBeUndefined()
    // Legacy rows resolve to their modern equivalents; owners store nothing.
    expect(defaultPermissionsFor('client_admin')).toEqual(DEFAULT_MANAGER_PERMS)
    expect(defaultPermissionsFor('client_user')).toEqual(DEFAULT_OFFICER_PERMS)
    expect(defaultPermissionsFor('owner')).toEqual({})
    expect(defaultPermissionsFor('super_admin')).toEqual({})
    // Copies, never shared references.
    expect(defaultPermissionsFor('manager')).not.toBe(DEFAULT_MANAGER_PERMS)
  })

  it('every key has a Thai label for the owner editor', () => {
    expect(PERMISSION_KEYS).toHaveLength(7)
    for (const k of PERMISSION_KEYS) {
      expect(PERMISSION_META[k].label.length).toBeGreaterThan(0)
      expect(PERMISSION_META[k].desc.length).toBeGreaterThan(0)
      expect(['daily', 'finance', 'danger']).toContain(PERMISSION_META[k].group)
    }
  })
})
