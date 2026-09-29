// Management-layer permissions — ported from invoice-system
// (server/handlers/_lib/permissions.js) so the shape matches the host exactly.
// Roles: owner (implicit full access) · manager · officer (permission-gated).

export const ALL_PERMISSION_KEYS = [
  'canManageSettings',
  'canViewReports',
  'canExportReports',
  'canViewCustomers',
  'canManageCustomers',
  'canViewCatalog',
  'canManageCatalog',
  'canCreateEditDocuments',
  'canManagePayroll',
  'canManageWht',
  'canSendDocuments',
  'canSendQuotations',
  'canSendDeliveryNotes',
  'canSendFinancialDocuments',
  'canRecordPayments',
  'canVoidDocuments',
  'canDeleteDocuments',
] as const

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number]
export type Permissions = Partial<Record<PermissionKey, boolean>>

// canSendDocuments is legacy-read-only (host keeps it out of the editor set).
export const EDITABLE_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((k) => k !== 'canSendDocuments')

const ALL = new Set<string>(ALL_PERMISSION_KEYS)
const EDITABLE = new Set<string>(EDITABLE_PERMISSION_KEYS)

const LEGACY_ALIASES: Record<string, PermissionKey[]> = {
  canManageCustomers: ['canViewCustomers'],
  canManageCatalog: ['canViewCatalog'],
  canViewReports: ['canExportReports'],
}

export type StaffRole = 'owner' | 'manager' | 'officer'
export const STAFF_ROLES: StaffRole[] = ['owner', 'manager', 'officer']

export function normalizePermissions(input: unknown, { allowLegacy = false } = {}): Permissions {
  if (input == null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) return {}
  const allowed = allowLegacy ? ALL : EDITABLE
  const out: Permissions = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) continue
    if (typeof value !== 'boolean') continue
    out[key as PermissionKey] = value
  }
  if (allowLegacy) {
    for (const [legacyKey, targets] of Object.entries(LEGACY_ALIASES)) {
      if ((input as Record<string, unknown>)[legacyKey] === true) for (const t of targets) out[t] = true
    }
  }
  return out
}

// Owner has full access implicitly; other roles are permission-gated.
export function hasPermission(role: string, permissions: Permissions | undefined, key: PermissionKey): boolean {
  if (role === 'owner') return true
  return permissions?.[key] === true
}
