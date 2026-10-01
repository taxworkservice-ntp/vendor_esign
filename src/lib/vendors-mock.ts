export interface ClientVendor {
  id: string
  tenantId: string
  vendorNo: number // per-tenant running vendor number (001, 002, …) used in receipt numbers
  prefix: string // คำนำหน้าชื่อ (นาย/นาง/นางสาว) — '' for entity vendors
  name: string
  address: string
  maskedId: string
  // Full tax ID for local testing/display. In production the full ID is never
  // stored in plaintext — only the encrypted form (encryptedId) + masked display.
  taxId?: string
  taxLast4?: string
  // Full tax ID, encrypted at rest (never plaintext) — see lib/id-crypto.ts.
  encryptedId?: string
  lineUserId?: string
  phone?: string
  email?: string
  /** Archived suppliers stay out of the default register. */
  isActive?: boolean
  // Money context, joined in by the list endpoint so the register can show what
  // is owed without an N+1. Absent on a single-vendor read.
  /** Sum of net for statuses that still represent money owed. */
  outstanding?: number
  txnCount?: number
  /** Latest transferDate across this vendor's transactions. */
  lastActivity?: string
  createdAt: string
}

const KEY = 'taxwork-vendors-v6'

function seed(): ClientVendor[] {
  const at = '2026-09-20T09:00:00+07:00'
  return [
    // ── Tenant ABC (10 vendors) ──
    { id: 'v-somchai', tenantId: 'ABC', vendorNo: 1, prefix: 'นาย', name: 'สมชาย การช่าง', address: '12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-3', taxId: '1234567890123', taxLast4: '0123', createdAt: at },
    { id: 'v-malee', tenantId: 'ABC', vendorNo: 2, prefix: 'นาง', name: 'มาลี ค้าส่ง', address: '88/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-23-4', taxId: '2345678901234', taxLast4: '1234', createdAt: at },
    { id: 'v-somsak', tenantId: 'ABC', vendorNo: 3, prefix: 'นาย', name: 'สมศักดิ์ ขนส่ง', address: '45 ซ.ร่วมใจ ต.บ้านเป็ด อ.เมือง จ.ขอนแก่น 40002', maskedId: 'x-xxxx-xxxxx-34-5', taxId: '3456789012345', taxLast4: '2345', createdAt: at },
    { id: 'v-prasert', tenantId: 'ABC', vendorNo: 4, prefix: 'นาย', name: 'ประเสริฐ ทรัพย์เจริญ', address: '101/2 ถ.ศรีจันทร์ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-45-6', taxId: '4567890123456', taxLast4: '3456', createdAt: at },
    { id: 'v-anon', tenantId: 'ABC', vendorNo: 5, prefix: 'นาย', name: 'อนล ช่างยนต์', address: '9 ถ.กลางเมือง ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-56-7', taxId: '5678901234567', taxLast4: '4567', createdAt: at },
    { id: 'v-kanya', tenantId: 'ABC', vendorNo: 6, prefix: 'นาง', name: 'กัญญา การบัญชี', address: '77 ม.11 ต.ศิลา อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-67-8', taxId: '6789012345678', taxLast4: '5678', createdAt: at },
    { id: 'v-wichai', tenantId: 'ABC', vendorNo: 7, prefix: 'นาย', name: 'วิชัย การเกษตร', address: '5 ม.3 ต.ท่าพระ อ.เมือง จ.ขอนแก่น 40260', maskedId: 'x-xxxx-xxxxx-78-9', taxId: '7890123456789', taxLast4: '6789', createdAt: at },
    { id: 'v-suda', tenantId: 'ABC', vendorNo: 8, prefix: 'นาง', name: 'สุดา เบเกอรี่', address: '24/6 ถ.รื่นรมย์ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-89-0', taxId: '8901234567890', taxLast4: '7890', createdAt: at },
    { id: 'v-thana', tenantId: 'ABC', vendorNo: 9, prefix: 'นาย', name: 'ธนา อิเล็กทริก', address: '63 ม.5 ต.บ้านเป็ด อ.เมือง จ.ขอนแก่น 40002', maskedId: 'x-xxxx-xxxxx-90-1', taxId: '9012345678901', taxLast4: '8901', createdAt: at },
    { id: 'v-nid', tenantId: 'ABC', vendorNo: 10, prefix: 'นาง', name: 'นิตยา นวดแผนไทย', address: '18 ซ.ศรีนคร ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-11-2', taxId: '1123456789012', taxLast4: '9012', createdAt: at },

    // ── Tenant DEMO (3 vendors; entities have no personal prefix) ──
    { id: 'v-demo-1', tenantId: 'DEMO', vendorNo: 1, prefix: '', name: 'บริษัท ซัพพลาย พลัส จำกัด', address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110', maskedId: 'x-xxxx-xxxxx-45-8', taxId: '0105566000011', taxLast4: '0011', createdAt: at },
    { id: 'v-demo-2', tenantId: 'DEMO', vendorNo: 2, prefix: '', name: 'ร้าน วัสดุก่อสร้าง รุ่งเรือง', address: '22 ม.2 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540', maskedId: 'x-xxxx-xxxxx-77-2', taxId: '0105566000022', taxLast4: '0022', createdAt: at },
    { id: 'v-demo-3', tenantId: 'DEMO', vendorNo: 3, prefix: 'นาง', name: 'สมหญิง บริการสะอาด', address: '7/8 ซ.ลาดพร้าว 71 เขตบางกะปิ กรุงเทพฯ 10240', maskedId: 'x-xxxx-xxxxx-19-5', taxId: '0105566000033', taxLast4: '0033', createdAt: at },
  ]
}

function read(): ClientVendor[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ClientVendor[]
  } catch { /* ignore */ }
  const v = seed()
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
  return v
}

function write(v: ClientVendor[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
}

// No tenantId = all vendors (lookups by unique id); pass a tenant to scope a list.
export function loadVendors(tenantId?: string): ClientVendor[] {
  const all = read()
  return tenantId ? all.filter((v) => v.tenantId === tenantId) : all
}

export function saveVendor(v: ClientVendor) {
  const all = read()
  const i = all.findIndex((x) => x.id === v.id)
  if (i >= 0) all[i] = v
  else all.unshift(v)
  write(all)
}

export function removeVendor(id: string) {
  write(read().filter((v) => v.id !== id))
}

// Next per-tenant vendor number (001, 002, …) — also the segment in receipt numbers.
export function nextVendorNo(tenantId: string): number {
  return read()
    .filter((v) => v.tenantId === tenantId)
    .reduce((max, v) => Math.max(max, v.vendorNo ?? 0), 0) + 1
}

// Full ID for display in the mock/test UI (never masked here).
export function displayTaxId(v: ClientVendor): string {
  return v.taxId || v.maskedId
}

export function maskFromLast4(last4: string): string {
  const d = last4.replace(/\D/g, '').slice(-4)
  return d.length === 4 ? `x-xxxx-xxxxx-${d.slice(0, 2)}-${d.slice(2)}` : 'x-xxxx-xxxxx-••-•'
}
