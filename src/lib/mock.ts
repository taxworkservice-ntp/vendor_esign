import type { PaymentTransaction, Vendor } from './types'
import { calcWht } from './config'

export const VENDORS: Vendor[] = [
  { id: 'v-somchai', name: 'สมชาย ใจดี', address: '12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-12-4' },
  { id: 'v-malee', name: 'มาลี มีสุข', address: '88/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000', maskedId: 'x-xxxx-xxxxx-87-1' },
  { id: 'v-somsak', name: 'สมศักดิ์ ขยัน', address: '45 ซ.ร่วมใจ ต.บ้านเป็ด อ.เมือง จ.ขอนแก่น 40002', maskedId: 'x-xxxx-xxxxx-33-9' },
]

function txn(
  t: Partial<PaymentTransaction> & Pick<PaymentTransaction, 'id' | 'vendor' | 'description' | 'grossAmount' | 'whtRate' | 'transferDate' | 'slipReference' | 'status'>,
): PaymentTransaction {
  const { wht, net } = calcWht(t.grossAmount, t.whtRate)
  const createdAt = '2026-09-20T09:00:00+07:00'
  return {
    paymentType: 'ค่าบริการ',
    slipName: 'slip.png',
    createdAt,
    timeline: [
      { at: createdAt, label: 'สร้างรายการ', detail: 'ธุรกรรมฉบับร่าง' },
      ...(t.status !== 'draft'
        ? [{ at: '2026-09-21T10:00:00+07:00', label: 'ส่งลิงก์ให้ผู้ขาย', detail: 'คัดลอกลิงก์ LINE' }]
        : []),
    ],
    checks: [
      { key: 'slip', label: 'สลิปตรงยอดสุทธิ', state: 'pass' },
      { key: 'name', label: 'ชื่อผู้รับตรงกับผู้ขาย', state: 'pass' },
      { key: 'wht', label: 'WHT ตรงตาม config', state: t.whtRate === 3 ? 'pass' : 'warn' },
    ],
    ...t,
    whtAmount: wht,
    netAmount: net,
  }
}

export const SEED_TXNS: PaymentTransaction[] = [
  txn({ id: 'TX-1042', vendor: VENDORS[0], description: 'ค่าจ้างทำความสะอาดสำนักงาน ก.ย.', grossAmount: 3000, whtRate: 3, transferDate: '2026-09-22', slipReference: 'TRF-881201', status: 'sent', inviteToken: 'tok_sent_demo' }),
  txn({ id: 'TX-1041', vendor: VENDORS[1], description: 'ค่าซ่อมแอร์ 2 เครื่อง', grossAmount: 8500, whtRate: 3, transferDate: '2026-09-18', slipReference: 'TRF-877310', status: 'issued' }),
  txn({ id: 'TX-1040', vendor: VENDORS[2], description: 'ค่าเช่าที่จอดรถรายเดือน', grossAmount: 5000, whtRate: 5, transferDate: '2026-09-10', slipReference: 'TRF-870022', status: 'void', voidReason: 'ยอด gross ผิด — ออกเลขใหม่แทน' }),
]

const KEY = 'taxwork-pilot-txns-v1'

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
