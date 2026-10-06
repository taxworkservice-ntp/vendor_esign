import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { fetchReceiptVerification } from '../lib/verify-source'
import { signMethodLabel } from '../lib/typed-signature'
import { fmtDateTH, fmtDateTimeTH } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'
import type { TxnStatus } from '../lib/types'

// Public verification: status + issue date + masked details ONLY.
// Never expose ID numbers, slips, or signatures here.
export function VerifyPage() {
  const { code } = useParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify', code],
    queryFn: () => fetchReceiptVerification(code ?? ''),
    retry: false,
  })

  const voided = data?.status === 'void'

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

      {isLoading && (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-body text-ink-500">กำลังตรวจสอบ…</p>
          </CardBody>
        </Card>
      )}

      {!isLoading && isError && (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="font-semibold">ตรวจสอบไม่สำเร็จ</p>
            <p className="mt-1 text-body text-ink-500">ระบบขัดข้องชั่วคราว — โปรดลองอีกครั้งภายหลัง</p>
          </CardBody>
        </Card>
      )}

      {!isLoading && !isError && !data && (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="font-semibold">ไม่พบรหัสตรวจสอบนี้</p>
            <p className="mt-1 text-body text-ink-500">โปรดตรวจสอบรหัสอีกครั้ง หรือสแกน QR บนเอกสาร</p>
          </CardBody>
        </Card>
      )}

      {!isLoading && !isError && data && (
        <Card>
          <CardBody className="space-y-3 text-body">
            {voided && (
              <p className="flex gap-2 rounded-control bg-danger-soft p-3 text-body font-semibold text-danger">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                เอกสารนี้ถูกยกเลิก{data.voidReason ? `: ${data.voidReason}` : ''} — ไม่สามารถใช้เป็นหลักฐานได้
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="font-mono text-body">{data.number}</span>
              <StatusBadge status={(voided ? 'void' : data.status) as TxnStatus} />
            </div>
            <p className="flex justify-between border-t border-card-border pt-3">
              <span className="text-ink-500">วันที่ออก</span>
              <span className="font-semibold">{data.issueDate ? fmtDateTH(data.issueDate.slice(0, 10)) : '—'}</span>
            </p>
            {data.signedAt && (
              <p className="flex justify-between">
                <span className="text-ink-500">ลงนามเมื่อ</span>
                <span className="font-semibold">{fmtDateTimeTH(String(data.signedAt))}</span>
              </p>
            )}
            {data.verificationMethod && (
              <p className="flex justify-between">
                <span className="text-ink-500">วิธีการลงนาม</span>
                <span className="font-semibold">{signMethodLabel(data.verificationMethod)}</span>
              </p>
            )}
            <p className="flex justify-between">
              <span className="text-ink-500">ผู้ขาย</span>
              <span className="font-semibold">{data.vendorMasked || '—'}</span>
            </p>
            <p className="text-label text-ink-400">
              รหัส {code?.toUpperCase()} · รายละเอียดเต็มอยู่บนเอกสารต้นฉบับเท่านั้น
            </p>
          </CardBody>
        </Card>
      )}

      <p className="text-center text-body">
        <Link to="/" className="font-semibold underline">กลับหน้าแรก</Link>
      </p>
    </div>
  )
}
