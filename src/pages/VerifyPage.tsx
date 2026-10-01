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
        <span className="grid h-9 w-9 place-items-center rounded-control bg-success text-white">
          <ShieldCheck size={18} />
        </span>
        <div className="leading-tight">
          <p className="text-body font-semibold">ตรวจสอบใบเสร็จ</p>
          <p className="text-label text-ink-500">ระบบออกใบเสร็จรับเงิน · แสดงเฉพาะข้อมูลที่จำเป็น</p>
        </div>
      </div>
      {!t ? (
        <Card><CardBody className="py-10 text-center">
          <p className="font-semibold">ไม่พบรหัสตรวจสอบนี้</p>
          <p className="mt-1 text-body text-ink-500">โปรดตรวจสอบรหัสอีกครั้ง หรือสแกน QR บนเอกสาร</p>
        </CardBody></Card>
      ) : (
        <Card><CardBody className="space-y-3 text-body">
          <div className="flex items-center justify-between">
            <span className="font-mono text-body">{t.receiptNumber ?? mockReceiptNumber(t.id, t.vendor.vendorNo ?? 0)}</span>
            <StatusBadge status={t.status} />
          </div>
          <p className="flex justify-between border-t border-card-border pt-3"><span className="text-ink-500">วันที่ออก</span><span className="font-semibold">{fmtDateTH(t.transferDate)}</span></p>
          <p className="flex justify-between"><span className="text-ink-500">ผู้ขาย</span><span className="font-semibold">{maskVendorName(t.vendor.name)}</span></p>
          <p className="text-label text-ink-400">รหัส {code?.toUpperCase()} · รายละเอียดเต็มอยู่บนเอกสารต้นฉบับเท่านั้น</p>
        </CardBody></Card>
      )}
      <p className="text-center text-body"><Link to="/" className="font-semibold underline">กลับหน้าแรก</Link></p>
    </div>
  )
}
