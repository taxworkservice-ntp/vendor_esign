import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useTransaction } from '../hooks/useTransactions'
import { getAuth } from '../hooks/useVendor'
import { clientFor } from '../lib/mock-clients'
import { mockReceiptNumber } from '../lib/receipt'
import { downloadElementAsA4Pdf } from '../lib/receipt-pdf'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { lineTotal, normalizeLineItem } from '../lib/line-items'
import { vendorDisplayName } from '../lib/vendor-name'
import { Button } from '../components/ui/button'
import { StatusBadge } from '../components/ui/badge'
import type { LineItem } from '../lib/types'

// Number/code derivation lives in lib/receipt (mock) — the real backend assigns
// the series number inside the finalization txn + random verification code.

const label = 'text-micro font-semibold uppercase tracking-[0.14em] text-ink-400'

export function ReceiptView() {
  const { id } = useParams()
  const { data: t } = useTransaction(id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(1)
  const sheetRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fit the fixed A4 sheet to the available width (never scale up past 100%).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const A4_PX = 794 // 210mm @ 96dpi
    const update = () => setZoom(Math.min(1, el.clientWidth / A4_PX))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!t) {
    return (
      <div className="space-y-3">
        <Link to="/" className="text-body font-semibold text-ink-500">← กลับรายการ</Link>
        <p>ไม่พบรายการ</p>
      </div>
    )
  }
  const auth = getAuth(t.id)
  const issued = t.status === 'signed' || t.status === 'issued'
  const number = t.receiptNumber ?? (issued ? mockReceiptNumber(t.id, t.vendor.vendorNo ?? 0) : 'ยังไม่ออกเลข')
  const isVoid = t.status === 'void'
  const client = clientFor(t.tenantId)
  const vendorName = auth?.vendorName ?? t.vendor.name
  const vendorPrefix = auth ? auth.vendorPrefix : t.vendor.prefix
  const items: LineItem[] = (t.lineItems?.some((it) => it.description || it.amount)
    ? t.lineItems
    : [{ description: t.description, amount: t.grossAmount }]
  ).map(normalizeLineItem)

  const download = async () => {
    setErr('')
    if (!sheetRef.current) return
    setBusy(true)
    try {
      await downloadElementAsA4Pdf(sheetRef.current, `${number}.pdf`)
    } catch {
      setErr('สร้าง PDF ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="receipt-doc mx-auto max-w-[210mm] space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          <span className="text-body text-ink-500">สำเนาใบเสร็จ · A4</span>
          {!issued && !isVoid && <span className="text-body font-medium text-amber-700">· รอออกเลขที่ใบเสร็จ</span>}
        </div>
        <div className="flex gap-2">
          <Button onClick={download} loading={busy} title="ดาวน์โหลด PDF (ตรงกับตัวอย่างนี้)">
            <Download size={15} /> {busy ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}
          </Button>
        </div>
      </div>
      {err && <p className="no-print text-body font-medium text-red-600">{err}</p>}

      <div className="print-area relative">
        <div ref={wrapRef} className="w-full">
          <div ref={sheetRef} style={{ zoom }} className="receipt-sheet relative flex flex-col overflow-hidden rounded-card border border-card-border bg-white font-[Sarabun] shadow-card">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-teal-700" />
          {isVoid && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="rotate-[-18deg] rounded-control border-4 border-red-600 px-8 py-2 text-4xl font-semibold text-red-600/70">VOID</span>
            </div>
          )}

          {/* Header: vendor (left) · document type (right) */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-title font-semibold leading-snug">{vendorDisplayName(vendorPrefix, vendorName)}</p>
              <p className="mt-0.5 text-body leading-relaxed text-ink-600">
                <span className="text-ink-400">ที่อยู่: </span>{auth?.vendorAddress ?? t.vendor.address}
              </p>
              <p className="mt-0.5 text-label text-ink-600">
                <span className="text-ink-400">เลขบัตรประชาชน: </span>
                <span className="font-mono">{t.vendor.taxId ?? t.vendor.maskedId}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <h1 className="text-page font-semibold leading-none tracking-tight">ใบเสร็จรับเงิน</h1>
              <p className="mt-1.5 text-micro font-semibold uppercase tracking-[0.2em] text-ink-400">Receipt</p>
              <p className="mt-0.5 text-body font-semibold text-ink-600">ต้นฉบับ</p>
              <div className="ml-auto mt-3 w-max space-y-1 text-body">
                <div className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 text-left text-ink-500">เลขที่:</span>
                  <span className="text-left font-mono font-semibold">{number}</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 text-left text-ink-500">วันที่:</span>
                  <span className="text-left">{fmtDateTH(t.transferDate)}</span>
                </div>
              </div>
            </div>
          </div>

          <hr className="my-5 border-ink-900" />

          {/* Client (full width) */}
          <div className="rounded-control bg-ink-50 p-3.5 text-body">
            <p className={label}>ผู้ซื้อ</p>
            <p className="mt-1.5 font-semibold">{client.displayName}</p>
            <p className="mt-0.5 text-body leading-relaxed text-ink-600">
              <span className="text-ink-400">ที่อยู่: </span>{client.address}
            </p>
            <p className="mt-0.5 text-label text-ink-600">
              <span className="text-ink-400">เลขประจำตัวผู้เสียภาษี: </span>
              <span className="font-mono">{client.taxId}</span>
            </p>
          </div>

          {t.note && <p className="mt-4 text-body text-ink-500">{t.note}</p>}

          {/* Items */}
          <div className="mt-5 text-body">
            <div className="flex items-baseline gap-2 border-b border-ink-900 pb-1.5">
              <span className={`${label} w-6 shrink-0`}>#</span>
              <span className={label}>รายละเอียด</span>
              <span className={`${label} ml-auto w-14 shrink-0 text-right`}>จำนวน</span>
              <span className={`${label} w-16 shrink-0 text-right`}>หน่วย</span>
              <span className={`${label} w-24 shrink-0 text-right`}>ราคา/หน่วย</span>
              <span className={`${label} w-20 shrink-0 text-right`}>ส่วนลด</span>
              <span className={`${label} w-24 shrink-0 text-right`}>จำนวนเงิน</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-baseline gap-2 border-b border-card-border py-1.5 last:border-0">
                <span className="w-6 shrink-0 text-right font-mono text-label text-ink-400">{i + 1}</span>
                <span className="min-w-0 flex-1 leading-snug">{it.description}</span>
                <span className="w-14 shrink-0 text-right tabular-nums">{it.quantity ?? 1}</span>
                <span className="w-16 shrink-0 text-right text-ink-600">{it.unit || 'รายการ'}</span>
                <span className="w-24 shrink-0 text-right tabular-nums">{fmtTHB(it.unitPrice ?? it.amount)}</span>
                <span className="w-20 shrink-0 text-right tabular-nums text-ink-500">
                  {it.discount ? `${fmtTHB(it.discount)}` : '—'}
                </span>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmtTHB(lineTotal(it))}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-5 text-body">
            <div className="flex justify-between py-1">
              <span className="text-ink-500">รวมเป็นเงิน</span>
              <span className="font-semibold tabular-nums">{fmtTHB(t.grossAmount)}</span>
            </div>
            {t.whtRate > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-ink-500">หักภาษี ณ ที่จ่าย {t.whtRate}%</span>
                <span className="tabular-nums text-ink-500">- {fmtTHB(t.whtAmount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink-900 pt-2.5">
              <span className="font-semibold">ยอดรับสุทธิ</span>
              <span className="text-xl font-semibold tabular-nums">{fmtTHB(t.netAmount)}</span>
            </div>
            <p className="mt-1.5 text-body text-ink-500">({amountToThaiWords(t.netAmount)})</p>
          </div>

          {isVoid && <p className="mt-4 text-label text-ink-400">ยกเลิกเอกสาร: {t.voidReason}</p>}

          {/* Signature centered */}
          <div className="mt-auto flex justify-center pt-10">
            <div className="w-[260px] text-center">
              <div className="flex h-14 items-end justify-center">
                {auth && <img src={auth.signaturePng} alt="ผู้มีอำนาจลงนาม" className="max-h-14 object-contain" />}
              </div>
              <p className="border-t border-ink-300 pt-2 text-body font-semibold">ผู้มีอำนาจลงนาม</p>
              <p className="text-label text-ink-400">{vendorDisplayName(vendorPrefix, vendorName)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
