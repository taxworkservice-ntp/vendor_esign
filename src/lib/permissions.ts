// Workspace permission flags — app-shaped, not the host's 17-key list (this
// portal has no quotations, delivery notes or payroll, so those keys would be
// dead weight that confuses owners). Seven flags, one per real capability:
//
//   owner: holds every flag implicitly — nothing is stored, so nothing drifts.
//   manager/officer: purely flag-driven. Flags are assigned from the role
//     defaults below at creation (see defaultPermissionsFor) and backfilled
//     once by migration 032; the owner then tightens/loosens per person.
//   legacy client_admin/client_user rows: backfilled as manager/officer and
//     checked exactly like them (no special-casing in the checker).

export const PERMISSION_KEYS = [
  'canManageVendors',
  'canManageTransactions',
  'canManageCatalog',
  'canManageWht',
  'canManageSettings',
  'canVoidDocuments',
  'canDeleteDocuments',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]
export type Permissions = Partial<Record<PermissionKey, boolean>>

export type PermissionGroup = 'daily' | 'finance' | 'danger'

export interface PermissionMeta {
  label: string
  desc: string
  group: PermissionGroup
}

/** Thai labels for the owner-facing editor — one source, every screen. */
export const PERMISSION_META: Record<PermissionKey, PermissionMeta> = {
  canManageVendors: { label: 'จัดการผู้ขาย', desc: 'สร้าง/แก้ไขผู้ขาย อนุมัติคำเชิญ ดูเลขภาษี', group: 'daily' },
  canManageTransactions: { label: 'สร้าง/ส่งธุรกรรม', desc: 'สร้างธุรกรรม ส่งและเพิกถอนลิงก์ ดูหลักฐานการลงนาม', group: 'daily' },
  canManageCatalog: { label: 'จัดการสินค้า', desc: 'จัดการรายการสินค้าและราคา', group: 'daily' },
  canManageWht: { label: 'ภาษีหัก ณ ที่จ่าย', desc: 'บันทึก ออกหนังสือรับรอง และพิมพ์ WHT', group: 'finance' },
  canManageSettings: { label: 'ตั้งค่าระบบ', desc: 'แก้ไขการตั้งค่าเวิร์กสเปซ (ไม่รวมจัดการทีม)', group: 'finance' },
  canVoidDocuments: { label: 'ยกเลิกเอกสาร', desc: 'ยกเลิกธุรกรรม ใบเสร็จ และ WHT ที่ออกแล้ว', group: 'danger' },
  canDeleteDocuments: { label: 'ลบข้อมูลถาวร', desc: 'ลบผู้ขายและสินค้าออกจากระบบ กู้คืนไม่ได้', group: 'danger' },
}

const ALLOWED = new Set<string>(PERMISSION_KEYS)

/** Keep only known boolean flags — unknown or non-boolean keys are dropped. */
export function normalizePermissions(input: unknown): Permissions {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Permissions = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED.has(key) || typeof value !== 'boolean') continue
    out[key as PermissionKey] = value
  }
  return out
}

/** Owner has full access implicitly; everyone else is strictly flag-driven. */
export function hasPermission(role: string, permissions: Permissions | undefined, key: PermissionKey): boolean {
  if (role === 'owner') return true
  return permissions?.[key] === true
}

/** Manager default: everything except permanent deletion. */
export const DEFAULT_MANAGER_PERMS: Permissions = {
  canManageVendors: true,
  canManageTransactions: true,
  canManageCatalog: true,
  canManageWht: true,
  canManageSettings: true,
  canVoidDocuments: true,
}

/** Officer default: daily entry work. WHT, settings, void and delete need an
 *  explicit grant from the owner. */
export const DEFAULT_OFFICER_PERMS: Permissions = {
  canManageVendors: true,
  canManageTransactions: true,
  canManageCatalog: true,
}

/** Starting flags for a freshly assigned role (copied, never shared). Legacy
 *  client_admin/client_user rows map to their modern equivalents. */
export function defaultPermissionsFor(role: string): Permissions {
  if (role === 'manager' || role === 'client_admin') return { ...DEFAULT_MANAGER_PERMS }
  if (role === 'officer' || role === 'client_user') return { ...DEFAULT_OFFICER_PERMS }
  return {}
}
