import type { WhtRecord, WhtVendor } from './wht'

// Per-tenant WHT store (mock). Server parity: wht_vendors + wht_records.

const KEY = 'taxwork-wht-v1'

export interface WhtBundle {
  vendors: WhtVendor[]
  records: WhtRecord[]
}

function seed(): WhtBundle {
  const at = '2026-09-20T09:00:00+07:00'
  const vendors: WhtVendor[] = [
    // ── ABC ──
    { id: 'w-abc-1', tenantId: 'ABC', name: 'สมชาย การช่าง', taxId: '1234567890123', address: '12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', vendorType: 'individual', isActive: true, createdAt: at },
    { id: 'w-abc-2', tenantId: 'ABC', name: 'บริษัท เอบีซี ซัพพลาย จำกัด', taxId: '0105569000111', address: '199/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', vendorType: 'company', isActive: true, createdAt: at },
    // ── DEMO ──
    { id: 'w-demo-1', tenantId: 'DEMO', name: 'บริษัท เดโม ซัพพลาย จำกัด', taxId: '0105566000011', address: '99/1 ถ.สุขุมวิท เขตคลองเตย กรุงเทพฯ 10110', vendorType: 'company', isActive: true, createdAt: at },
  ]
  const records: WhtRecord[] = [
    { id: 'wr-abc-1', tenantId: 'ABC', vendorId: 'w-abc-2', formType: 'pnd53', issueDate: '2026-09-18', amount: 5000, whtRate: 3, whtAmount: 150, certificateNo: '2609001', description: 'ค่าบริการ', status: 'active', createdAt: at },
    { id: 'wr-abc-2', tenantId: 'ABC', vendorId: 'w-abc-1', formType: 'pnd3', issueDate: '2026-09-22', amount: 3000, whtRate: 3, whtAmount: 90, certificateNo: '2609002', description: 'ค่าจ้างทำความสะอาด', status: 'active', createdAt: at },
    { id: 'wr-demo-1', tenantId: 'DEMO', vendorId: 'w-demo-1', formType: 'pnd53', issueDate: '2026-09-19', amount: 18000, whtRate: 3, whtAmount: 540, certificateNo: '2609001', description: 'ค่าซ่อมแซม', status: 'active', createdAt: at },
  ]
  return { vendors, records }
}

function read(): WhtBundle {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as WhtBundle
  } catch { /* ignore */ }
  const v = seed()
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
  return v
}

function write(v: WhtBundle) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
}

// tenantId optional = all; otherwise scoped to the workspace.
export function loadWht(tenantId?: string): WhtBundle {
  const all = read()
  if (!tenantId) return all
  return { vendors: all.vendors.filter((v) => v.tenantId === tenantId), records: all.records.filter((r) => r.tenantId === tenantId) }
}

export function loadWhtByIds(ids: string[]): { records: (WhtRecord & { vendor?: WhtVendor })[]; tenantId: string | null } {
  const all = read()
  const records = all.records
    .filter((r) => ids.includes(r.id))
    .map((r) => ({ ...r, vendor: all.vendors.find((v) => v.id === r.vendorId) }))
  return { records, tenantId: records[0]?.tenantId ?? null }
}

export function saveWht(bundle: WhtBundle) {
  write(bundle)
}
