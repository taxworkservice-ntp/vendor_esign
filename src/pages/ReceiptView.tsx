import { Link, useParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { useTransaction } from '../hooks/useTransactions'
import { getAuth } from '../hooks/useVendor'
import { PILOT_CONFIG } from '../lib/config'
import { mockReceiptNumber, mockVerificationCode } from '../lib/receipt'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { StatusBadge } from '../components/ui/badge'

// Number/code derivation lives in lib/receipt (mock) — real backend assigns the
// series number inside the finalization txn + random verification code.

export function ReceiptView() {
  const { id } = useParams()
  const { data: t } = useTransaction(id)
  if (!t) {
    return (
      <div className="space-y-3">
        <Link to="/" className="text-sm font-semibold text-ink-500">← กลับรายการ</Link>
        <p>ไม่พบรายการ</p>
      </div>
    )
  }
  const auth = getAuth(t.id)
  const issued = t.status === 'signed' || t.status === 'issued'
  const number = issued ? mockReceiptNumber(t.id) : '— ยังไม่ออกเลข (ออกเมื่อผู้ขายเซ็น) —'
  const code = mockVerificationCode(t.id)
  const isVoid = t.status === 'void'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          <span className="text-sm text-ink-500">สำเนาใบเสร็จ (preview — PDF ฉบับจริงจากเซิร์ฟเวอร์ใน Phase 3)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled title="PDF เซิร์ฟเวอร์ใน Phase 3"><Download size={15} /> PDF</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> พิมพ์</Button>
        </div>
      </div>

      <Card className="print-area relative overflow-hidden">
        {isVoid && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rotate-[-18deg] rounded-xl border-4 border-red-600 px-8 py-2 text-4xl font-bold text-red-600/70">VOID</span>
          </div>
        )}
        <CardBody className="font-[Sarabun] sm:p-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold">ใบเสร็จรับเงิน</h1>
            <p className="mt-1 text-sm">เลขที่ <b className="font-mono">{number}</b> · วันที่ {fmtDateTH(t.transferDate)}</p>
          </div>

          <div className="mt-6 grid gap-4 text-[14px] sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-bold">ผู้ขาย (ผู้รับเงิน)</p>
              <p className="mt-1">{auth?.vendorName ?? t.vendor.name}</p>
              <p className="text-ink-500">{auth?.vendorAddress ?? t.vendor.address}</p>
              <p className="text-ink-500">เลขบัตร: {auth ? `x-xxxx-xxxxx-${auth.vendorIdLast4.slice(0, 2)}-${auth.vendorIdLast4.slice(2)}` : t.vendor.maskedId}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-bold">ผู้ซื้อ (ลูกค้า)</p>
              <p className="mt-1">{PILOT_CONFIG.clientCode} (ชื่อ/ที่อยู่/เลขภาษีฉบับจริง — รอคอนเฟิร์ม [VERIFY])</p>
            </div>
          </div>

          <table className="mt-4 w-full text-[14px]">
            <thead>
              <tr className="border-b-2 border-ink-900 text-left">
                <th className="py-2">รายการ</th>
                <th className="py-2 text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-2">{t.description}<br /><span className="text-xs text-ink-500">โอน {fmtDateTH(t.transferDate)} · อ้างอิง {t.slipReference || '—'}</span></td>
                <td className="py-2 text-right tabular-nums">฿{fmtTHB(t.grossAmount)}</td>
              </tr>
              {t.whtRate > 0 && (
                <tr className="border-b border-slate-200">
                  <td className="py-2">หักภาษี ณ ที่จ่าย {t.whtRate}%</td>
                  <td className="py-2 text-right tabular-nums">฿{fmtTHB(t.whtAmount)}</td>
                </tr>
              )}
              <tr>
                <td className="py-2 font-bold">ยอดรับสุทธิ<br /><span className="text-xs font-normal">({amountToThaiWords(t.netAmount)})</span></td>
                <td className="py-2 text-right text-lg font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[13px]">
            ผู้ขายมิได้จดทะเบียนภาษีมูลค่าเพิ่ม — เอกสารนี้เป็นใบเสร็จรับเงินเท่านั้น ไม่ใช่ใบกำกับภาษี ·
            ออกโดยผู้แทนลูกค้าในนามและโดยได้รับมอบอำนาจจากผู้ขายเฉพาะธุรกรรมนี้
          </p>

          <div className="mt-6 grid grid-cols-2 gap-6 text-center text-[14px]">
            <div>
              {auth ? (
                <img src={auth.signaturePng} alt="ลายเซ็นผู้ขาย" className="mx-auto h-16 object-contain" />
              ) : (
                <div className="mx-auto h-16" />
              )}
              <p className="border-t border-slate-300 pt-1">ลายเซ็นผู้ขาย<br /><span className="text-xs text-ink-500">({auth?.vendorName ?? '—'})</span></p>
            </div>
            <div>
              <div className="h-16" />
              <p className="border-t border-slate-300 pt-1">ลายเซ็นผู้แทน<br /><span className="text-xs text-ink-500">(ชื่อ / ตำแหน่ง — เซ็นบนกระดาษหลังพิมพ์)</span></p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-dashed border-slate-300 pt-3 text-xs text-ink-500">
            <div>
              <p>ยืนยัน: {auth ? fmtDateTH(auth.signedAt) : '—'} · วิธี: {auth?.verificationMethod ?? '—'} · consent {auth?.consentVersion ?? '—'}</p>
              <p>รหัสตรวจสอบ: <b className="font-mono">{code}</b> · สถานะธุรกรรม: {t.id}</p>
              {isVoid && <p className="font-semibold text-red-600">void: {t.voidReason} · เลขเดิมคงไว้</p>}
            </div>
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-slate-300 text-center text-[10px] leading-tight">
              QR<br />ตรวจสอบ<br />(Phase 3)
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
