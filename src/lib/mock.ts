import type { LineItem, PaymentTransaction, Vendor } from './types'
import { calcWht } from './config'
import { itemsSummary, itemsTotal, normalizeLineItem } from './line-items'

// ── Tenant ABC (pilot) ──
export const VENDORS: Vendor[] = [
  { id: 'v-somchai', vendorNo: 1, prefix: 'นาย', name: 'สมชาย การช่าง', address: '12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-3', taxId: '1234567890123' },
  { id: 'v-malee', vendorNo: 2, prefix: 'นาง', name: 'มาลี ค้าส่ง', address: '88/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-23-4', taxId: '2345678901234' },
  { id: 'v-somsak', vendorNo: 3, prefix: 'นาย', name: 'สมศักดิ์ ขนส่ง', address: '45 ซ.ร่วมใจ ต.บ้านเป็ด อ.เมือง จ.ขอนแก่น 40002', maskedId: 'x-xxxx-xxxxx-34-5', taxId: '3456789012345' },
]

// ── Tenant DEMO (test client) ──
export const DEMO_VENDORS: Vendor[] = [
  { id: 'v-demo-1', vendorNo: 1, prefix: '', name: 'บริษัท ซัพพลาย พลัส จำกัด', address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110', maskedId: 'x-xxxx-xxxxx-45-8', taxId: '0105566000011' },
  { id: 'v-demo-2', vendorNo: 2, prefix: '', name: 'ร้าน วัสดุก่อสร้าง รุ่งเรือง', address: '22 ม.2 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540', maskedId: 'x-xxxx-xxxxx-77-2', taxId: '0105566000022' },
  { id: 'v-demo-3', vendorNo: 3, prefix: 'นาง', name: 'สมหญิง บริการสะอาด', address: '7/8 ซ.ลาดพร้าว 71 เขตบางกะปิ กรุงเทพฯ 10240', maskedId: 'x-xxxx-xxxxx-19-5', taxId: '0105566000033' },
]

export function vendorsForTenant(tenantId: string): Vendor[] {
  return tenantId === 'DEMO' ? DEMO_VENDORS : VENDORS
}

const item = (description: string, amount: number, extra?: Partial<LineItem>): LineItem =>
  normalizeLineItem({ description, amount, ...extra })

function txn(
  t: Partial<PaymentTransaction> &
    Pick<PaymentTransaction, 'id' | 'tenantId' | 'vendor' | 'lineItems' | 'whtRate' | 'transferDate' | 'slipReference' | 'status'>,
): PaymentTransaction {
  const whtMode = t.whtMode ?? 'deduct'
  const entered = itemsTotal(t.lineItems)
  const { gross, wht, net } = calcWht(entered, t.whtRate, whtMode)
  const createdAt = t.createdAt ?? '2026-09-20T09:00:00+07:00'
  return {
    paymentType: 'ค่าบริการ',
    description: itemsSummary(t.lineItems, t.note),
    note: '',
    slipName: 'slip.png',
    createdAt,
    timeline: [
      { at: createdAt, label: 'สร้างรายการ', detail: 'ธุรกรรมฉบับร่าง' },
      ...(t.status !== 'draft'
        ? [{ at: '2026-09-21T10:00:00+07:00', label: 'ส่งลิงก์ให้ผู้ขาย', detail: 'คัดลอกลิงก์ทาง LINE' }]
        : []),
    ],
    checks: [
      { key: 'slip', label: 'สลิปตรงยอดสุทธิ', state: 'pass' },
      { key: 'name', label: 'ชื่อผู้รับตรงกับผู้ขาย', state: 'pass' },
      { key: 'wht', label: 'ภาษีหัก ณ ที่จ่ายตรงตามค่าที่ตั้งไว้', state: t.whtRate === 3 ? 'pass' : 'warn' },
    ],
    ...t,
    whtMode,
    grossAmount: gross,
    whtAmount: wht,
    netAmount: net,
  }
}

export const SEED_TXNS: PaymentTransaction[] = [
  // ── ABC ──
  txn({
    id: 'TX-1042', tenantId: 'ABC', vendor: VENDORS[0], status: 'sent', inviteToken: 'tok_sent_demo',
    whtRate: 3, transferDate: '2026-09-22', slipReference: 'TRF-881201',
    lineItems: [item('ค่าจ้างทำความสะอาดสำนักงาน ก.ย.', 3000, { unit: 'งาน', quantity: 1, unitPrice: 3000 })],
  }),
  txn({
    id: 'TX-1041', tenantId: 'ABC', vendor: VENDORS[1], status: 'issued', receiptNumber: 'RCT-002-2569-001',
    note: 'งานซ่อมบำรุงเครื่องปรับอากาศ', whtRate: 3, transferDate: '2026-09-18', slipReference: 'TRF-877310',
    lineItems: [
      item('ค่าซ่อมแอร์ (ค่าบริการ)', 5000, { unit: 'เครื่อง', quantity: 2, unitPrice: 2500 }),
      item('ค่าอะไหล่ R32', 3500, { unit: 'ชุด', quantity: 1, unitPrice: 3500 }),
    ],
  }),
  txn({
    id: 'TX-1040', tenantId: 'ABC', vendor: VENDORS[2], status: 'void', receiptNumber: 'RCT-003-2569-001',
    voidReason: 'ยอดรวมก่อนหักภาษีไม่ถูกต้อง — ออกเลขที่ใหม่แทน', whtRate: 5, transferDate: '2026-09-10', slipReference: 'TRF-870022',
    lineItems: [item('ค่าเช่าที่จอดรถรายเดือน', 5000, { unit: 'เดือน', quantity: 1, unitPrice: 5000 })],
  }),

  // ── DEMO (test client) ──
  txn({
    id: 'DM-2003', tenantId: 'DEMO', vendor: DEMO_VENDORS[0], status: 'sent', inviteToken: 'tok_demo_sent',
    paymentType: 'ค่าขนส่ง', note: 'จัดส่งวัสดุสำนักงาน', whtRate: 1, transferDate: '2026-09-24', slipReference: 'TRF-DM-1001',
    lineItems: [item('ค่าจัดส่งวัสดุสำนักงาน', 1200, { unit: 'เที่ยว', quantity: 1, unitPrice: 1500, discount: 300 })],
  }),
  txn({
    id: 'DM-2002', tenantId: 'DEMO', vendor: DEMO_VENDORS[1], status: 'issued', receiptNumber: 'RCT-002-2569-001',
    paymentType: 'ค่าบริการ', note: 'งานปรับปรุงสำนักงาน', whtRate: 3, transferDate: '2026-09-19', slipReference: 'TRF-DM-1000',
    lineItems: [
      item('ค่าซ่อมแซมผนังและทาสี', 18000, { unit: 'งาน', quantity: 1, unitPrice: 18000 }),
      item('ค่าอะไหล่และวัสดุ', 4200, { unit: 'ชุด', quantity: 1, unitPrice: 4200 }),
    ],
  }),
  txn({
    id: 'DM-2001', tenantId: 'DEMO', vendor: DEMO_VENDORS[2], status: 'void', receiptNumber: 'RCT-003-2569-001',
    voidReason: 'บันทึกผิดบริษัท', paymentType: 'ค่าบริการ', whtRate: 3, transferDate: '2026-09-05', slipReference: 'TRF-DM-0999',
    lineItems: [item('ค่าทำความสะอาดออฟฟิศ', 4000, { unit: 'งาน', quantity: 1, unitPrice: 4000 })],
  }),
]

const KEY = 'taxwork-pilot-txns-v8'

export function loadTxns(): PaymentTransaction[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return SEED_TXNS
}

export function saveTxns(txns: PaymentTransaction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(txns))
  } catch {
    /* ignore */
  }
}
