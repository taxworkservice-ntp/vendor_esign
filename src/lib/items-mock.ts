export interface CatalogItem {
  id: string
  tenantId: string
  itemNo: number // per-workspace running number (ITM-001, …)
  name: string
  unit: string
  unitPrice: number
  /** Archived entries drop out of the default catalogue. */
  isActive?: boolean
  createdAt: string
}

const KEY = 'taxwork-items-v1'

function seed(): CatalogItem[] {
  const at = '2026-09-20T09:00:00+07:00'
  return [
    // ── Tenant ABC ──
    { id: 'it-abc-1', tenantId: 'ABC', itemNo: 1, name: 'ค่าจ้างทำความสะอาดสำนักงาน', unit: 'งาน', unitPrice: 3000, createdAt: at },
    { id: 'it-abc-2', tenantId: 'ABC', itemNo: 2, name: 'ค่าซ่อมแอร์ (ต่อเครื่อง)', unit: 'เครื่อง', unitPrice: 2500, createdAt: at },
    { id: 'it-abc-3', tenantId: 'ABC', itemNo: 3, name: 'ค่าอะไหล่แอร์ R32', unit: 'ชุด', unitPrice: 3500, createdAt: at },
    { id: 'it-abc-4', tenantId: 'ABC', itemNo: 4, name: 'ค่าเช่าที่จอดรถรายเดือน', unit: 'เดือน', unitPrice: 5000, createdAt: at },
    { id: 'it-abc-5', tenantId: 'ABC', itemNo: 5, name: 'ค่าจัดส่ง (ต่อเที่ยว)', unit: 'เที่ยว', unitPrice: 1500, createdAt: at },
    { id: 'it-abc-6', tenantId: 'ABC', itemNo: 6, name: 'ค่าจ้างช่าง (ต่อชั่วโมง)', unit: 'ชั่วโมง', unitPrice: 350, createdAt: at },
    { id: 'it-abc-7', tenantId: 'ABC', itemNo: 7, name: 'ค่าบริการบำรุงรักษารายเดือน', unit: 'เดือน', unitPrice: 2000, createdAt: at },
    { id: 'it-abc-8', tenantId: 'ABC', itemNo: 8, name: 'ค่าวัสดุสิ้นเปลือง', unit: 'ชุด', unitPrice: 800, createdAt: at },
    // ── Tenant DEMO ──
    { id: 'it-demo-1', tenantId: 'DEMO', itemNo: 1, name: 'ค่าบริการให้คำปรึกษา', unit: 'ชั่วโมง', unitPrice: 1500, createdAt: at },
    { id: 'it-demo-2', tenantId: 'DEMO', itemNo: 2, name: 'ค่าซ่อมแซมผนังและทาสี', unit: 'งาน', unitPrice: 18000, createdAt: at },
    { id: 'it-demo-3', tenantId: 'DEMO', itemNo: 3, name: 'ค่าอะไหล่และวัสดุ', unit: 'ชุด', unitPrice: 4200, createdAt: at },
    { id: 'it-demo-4', tenantId: 'DEMO', itemNo: 4, name: 'ค่าจัดส่งวัสดุ', unit: 'เที่ยว', unitPrice: 1500, createdAt: at },
    { id: 'it-demo-5', tenantId: 'DEMO', itemNo: 5, name: 'ค่าเช่าอุปกรณ์', unit: 'วัน', unitPrice: 900, createdAt: at },
  ]
}

function read(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CatalogItem[]
  } catch { /* ignore */ }
  const v = seed()
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
  return v
}

function write(v: CatalogItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch { /* ignore */ }
}

// No tenantId = all items; pass a tenant to scope a list.
export function loadItems(tenantId?: string): CatalogItem[] {
  const all = read()
  return tenantId ? all.filter((i) => i.tenantId === tenantId) : all
}

export function saveItem(item: CatalogItem) {
  const all = read()
  const i = all.findIndex((x) => x.id === item.id)
  if (i >= 0) all[i] = item
  else all.unshift(item)
  write(all)
}

export function deleteItem(id: string) {
  write(read().filter((x) => x.id !== id))
}

// Next per-workspace item number (ITM-001, ITM-002, …).
export function nextItemNo(tenantId: string): number {
  return read()
    .filter((i) => i.tenantId === tenantId)
    .reduce((max, i) => Math.max(max, i.itemNo ?? 0), 0) + 1
}
