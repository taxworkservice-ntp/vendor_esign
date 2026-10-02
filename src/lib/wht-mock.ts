import type { WhtRecord, WhtRecordWithVendor, WhtVendor } from './wht'
import { formTypeForVendorType, nextWhtCertificateNo } from './wht'
import type { PaymentTransaction } from './types'
import { isEntityName, vendorDisplayName } from './vendor-name'
import { loadSettings } from './settings'

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

export function loadWhtByIds(ids: string[]): { records: WhtRecordWithVendor[]; tenantId: string | null } {
  const all = read()
  const vendorById = new Map<string, WhtVendor>(all.vendors.map((v) => [v.id, v]))
  const records = all.records
    .filter((r) => ids.includes(r.id))
    .map((r) => {
      const v = vendorById.get(r.vendorId)
      return { ...r, vendorName: v?.name, vendorTaxId: v?.taxId, vendorAddress: v?.address }
    })
  return { records, tenantId: records[0]?.tenantId ?? null }
}

export function saveWht(bundle: WhtBundle) {
  write(bundle)
}

// Auto-generate the withholding certificate when a receipt is issued. Idempotent
// per transaction, so re-issuing never duplicates. Returns the new record (or
// null when there is no WHT to withhold or it already exists).
export function generateWhtForTxn(txn: PaymentTransaction): WhtRecord | null {
  if (!(txn.whtAmount > 0)) return null
  const all = read()
  if (all.records.some((r) => r.sourceTransactionId === txn.id)) return null

  const vendorName = vendorDisplayName(txn.vendor.prefix, txn.vendor.name)
  const vendors = [...all.vendors]
  let vendor = vendors.find(
    (v) =>
      v.tenantId === txn.tenantId &&
      ((txn.vendor.taxId && v.taxId && v.taxId === txn.vendor.taxId) || v.name === vendorName),
  )
  if (!vendor) {
    vendor = {
      id: `wv-${txn.vendor.id}`,
      tenantId: txn.tenantId,
      name: vendorName,
      taxId: txn.vendor.taxId ?? '',
      address: txn.vendor.address,
      vendorType: isEntityName(txn.vendor.name) ? 'company' : 'individual' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    vendors.unshift(vendor)
  }

  const issueDate = txn.transferDate || new Date().toISOString().slice(0, 10)
  const certificateNo = nextWhtCertificateNo(
    all.records.filter((r) => r.tenantId === txn.tenantId).map((r) => r.certificateNo),
    issueDate,
  )
  const s = loadSettings(txn.tenantId)
  const paymentTypeLabel = s.whtRates.find((r) => r.paymentType === txn.paymentType)?.label
    ?? txn.paymentType
  const record: WhtRecord = {
    id: `wr-${txn.id}`,
    tenantId: txn.tenantId,
    vendorId: vendor.id,
    formType: formTypeForVendorType(vendor.vendorType ?? 'individual'),
    issueDate,
    amount: txn.grossAmount,
    whtRate: txn.whtRate,
    whtAmount: txn.whtAmount,
    certificateNo,
    description: paymentTypeLabel,
    status: 'active',
    createdAt: new Date().toISOString(),
    sourceTransactionId: txn.id,
  }
  write({ vendors, records: [record, ...all.records] })
  return record
}
