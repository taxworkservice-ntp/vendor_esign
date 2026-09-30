// Vendor name prefix (คำนำหน้าชื่อ) rules — pure and dependency-free so both the
// client portal and the server bundle can import it (like line-items.ts).

export const VENDOR_PREFIXES = ['นาย', 'นาง', 'นางสาว'] as const
export type VendorPrefix = (typeof VENDOR_PREFIXES)[number]

export function isVendorPrefix(v: string): v is VendorPrefix {
  return (VENDOR_PREFIXES as readonly string[]).includes(v)
}

// Entity (juristic) names don't take a personal title, so they are exempt from
// the required-prefix rule.
const ENTITY_PREFIXES = ['บริษัท', 'ห้าง', 'ร้าน', 'สหกรณ์', 'มูลนิธิ', 'องค์กร', 'สำนักงาน', 'โรงเรียน', 'วัด', 'โรงพยาบาล']

export function isEntityName(name: string): boolean {
  const n = name.trim()
  return ENTITY_PREFIXES.some((p) => n.startsWith(p)) || n.includes('จำกัด')
}

// Prefix is required only for individuals.
export function prefixRequired(name: string): boolean {
  return !isEntityName(name)
}

// "นาย สมชาย การช่าง" | "บริษัท ซัพพลาย พลัส จำกัด" (omits the space when empty).
export function vendorDisplayName(prefix: string | undefined, name: string | undefined): string {
  const p = (prefix ?? '').trim()
  const n = (name ?? '').trim()
  return p ? `${p} ${n}` : n
}
