import { Link, useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { loadTxns } from '../lib/mock'
import { maskVendorName, mockReceiptNumber, mockVerificationCode } from '../lib/receipt'
import { fmtDateTH } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'

// Public verification: status + issue date + masked details ONLY.
// Never expose ID numbers, slips, or signatures here.
export function VerifyPage() {
  const { code } = useParams()
  const t = loadTxns().find((x) => mockVerificationCode(x.id) === (code ?? '').toUpperCase())

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white">
          <ShieldCheck size={18} />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-bold">ตรวจสอบใบเสร็จ</p>
          <p className="text-xs text-ink-500">Taxwork pilot · แสดงเฉพาะข้อมูลที่จำเป็น</p>
        </div>
      </div>
      {!t ? (
        <Card><CardBody className="py-10 text-center">
          <p className="font-bold">ไม่พบรหัสตรวจสอบนี้</p>
          <p className="mt-1 text-sm text-ink-500">ตรวจตัวอักษรอีกครั้ง หรือสแกน QR บนเอกสารใหม่</p>
        </CardBody></Card>
      ) : (
        <Card><CardBody className="space-y-3 text-[15px]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm">{mockReceiptNumber(t.id)}</span>
            <StatusBadge status={t.status} />
          </div>
          <p className="flex justify-between border-t border-slate-100 pt-3"><span className="text-ink-500">วันที่ออก</span><span className="font-semibold">{fmtDateTH(t.transferDate)}</span></p>
          <p className="flex justify-between"><span className="text-ink-500">ผู้ขาย</span><span className="font-semibold">{maskVendorName(t.vendor.name)}</span></p>
          <p className="text-xs text-ink-400">รหัส {code?.toUpperCase()} · รายละเอียดเต็มอยู่บนเอกสารต้นฉบับเท่านั้น</p>
        </CardBody></Card>
      )}
      <p className="text-center text-sm"><Link to="/" className="font-semibold underline">กลับหน้าแรก</Link></p>
    </div>
  )
}
