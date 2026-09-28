import { Link, useParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { useTransaction } from '../hooks/useTransactions'
import { getAuth } from '../hooks/useVendor'
import { PILOT_CONFIG } from '../lib/config'
import { mockReceiptNumber, mockVerificationCode } from '../lib/receipt'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { Button } from '../components/ui/button'
import { StatusBadge } from '../components/ui/badge'

// Number/code derivation lives in lib/receipt (mock) — real backend assigns the
// series number inside the finalization txn + random verification code.

const label = 'text-[11px] font-semibold uppercase tracking-widest text-ink-400'

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
  const number = issued ? mockReceiptNumber(t.id) : 'ยังไม่ออกเลข'
  const code = mockVerificationCode(t.id)
  const isVoid = t.status === 'void'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          <span className="text-sm text-ink-500">สำเนาใบเสร็จ (preview)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled title="PDF เซิร์ฟเวอร์ใน Phase 3"><Download size={15} /> PDF</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> พิมพ์</Button>
        </div>
      </div>

      <div className="print-area relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {isVoid && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rotate-[-18deg] rounded-xl border-4 border-red-600 px-8 py-2 text-4xl font-bold text-red-600/70">VOID</span>
          </div>
        )}
        <div className="p-8 font-[Sarabun] sm:p-12">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-bold leading-none">ใบเสร็จรับเงิน</h1>
              <p className="mt-1.5 text-xs tracking-widest text-ink-400">RECEIPT · ไม่ใช่ใบกำกับภาษี</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-mono font-semibold">{number}</p>
              <p className="mt-0.5 text-ink-500">{fmtDateTH(t.transferDate)}</p>
            </div>
          </div>

          <hr className="my-7 border-slate-200" />

          <div className="grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <p className={label}>ผู้ขาย · ผู้รับเงิน</p>
              <p className="mt-1.5 font-semibold">{auth?.vendorName ?? t.vendor.name}</p>
              <p className="mt-0.5 text-ink-500">{auth?.vendorAddress ?? t.vendor.address}</p>
              <p className="mt-0.5 font-mono text-[13px] text-ink-500">
                {auth ? `x-xxxx-xxxxx-${auth.vendorIdLast4.slice(0, 2)}-${auth.vendorIdLast4.slice(2)}` : t.vendor.maskedId}
              </p>
            </div>
            <div>
              <p className={label}>ผู้ซื้อ · ลูกค้า</p>
              <p className="mt-1.5 font-semibold">{PILOT_CONFIG.clientCode}</p>
              <p className="mt-0.5 text-ink-500">ชื่อ/ที่อยู่/เลขภาษีฉบับจริง — รอคอนเฟิร์ม [VERIFY]</p>
            </div>
          </div>

          <div className="mt-8 text-sm">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <div>
                <p className="font-medium">{t.description}</p>
                <p className="mt-0.5 text-[13px] text-ink-400">โอน {fmtDateTH(t.transferDate)}{t.slipReference ? ` · อ้างอิง ${t.slipReference}` : ''}</p>
              </div>
              <p className="shrink-0 tabular-nums">฿{fmtTHB(t.grossAmount)}</p>
            </div>
            {t.whtRate > 0 && (
              <div className="flex items-baseline justify-between gap-4 border-t border-slate-100 py-2.5">
                <p className="text-ink-500">หักภาษี ณ ที่จ่าย {t.whtRate}%</p>
                <p className="shrink-0 tabular-nums text-ink-500">฿{fmtTHB(t.whtAmount)}</p>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink-900 py-3">
              <div>
                <p className="font-bold">ยอดรับสุทธิ</p>
                <p className="mt-0.5 text-[13px] text-ink-500">({amountToThaiWords(t.netAmount)})</p>
              </div>
              <p className="shrink-0 text-xl font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</p>
            </div>
          </div>

          <p className="mt-6 text-[12.5px] leading-relaxed text-ink-400">
            ผู้ขายมิได้จดทะเบียนภาษีมูลค่าเพิ่ม
          </p>

          <div className="mt-10 max-w-[240px] text-center text-sm">
            <div className="flex h-16 items-end justify-center">
              {auth && <img src={auth.signaturePng} alt="ลายเซ็นผู้ขาย" className="max-h-16 object-contain" />}
            </div>
            <p className="border-t border-slate-300 pt-2 text-[13px]">ลายเซ็นผู้ขาย</p>
            <p className="text-xs text-ink-400">({auth?.vendorName ?? '—'})</p>
          </div>

          <div className="mt-10 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
            <p className="text-[11px] leading-relaxed text-ink-400">
              รหัสตรวจสอบ <span className="font-mono font-semibold text-ink-500">{code}</span>
              {auth ? ` · ยืนยัน ${fmtDateTH(auth.signedAt)} · ${auth.verificationMethod}` : ''}
              {isVoid ? ` · void: ${t.voidReason}` : ''}
            </p>
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-slate-200 text-center text-[9px] leading-tight text-ink-400">
              QR<br />ตรวจสอบ
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
