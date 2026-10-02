import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileText, ImageDown, Info } from 'lucide-react'
import { useTransaction } from '../hooks/useTransactions'
import { useReceiptAuthorization } from '../hooks/useReceiptAuthorization'
import { clientFor } from '../lib/mock-clients'
import { mockReceiptNumber } from '../lib/receipt'
import { downloadElementAsA4Pdf } from '../lib/receipt-pdf'
import { SIGNATURE_COPY, signatureState } from '../lib/signature-state'
import { apiDownload, hasServer, saveBlob } from '../lib/api-client'
import { documentFileName } from '../lib/download-name'
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
  // The issued PDF is the statutory artifact: built server-side with the vendor
  // signature embedded and a SHA-256 recorded at issuance. The html2canvas
  // snapshot of this sheet is NOT that document — it is an image with no
  // signature and no hash — so it is only offered before issuance and labelled
  // so it cannot be mistaken for the receipt.
  //
  // Also above the not-found return: it used to sit below it, so the not-found
  // render called one hook fewer than every other render.
  const [issuedFile, setIssuedFile] = useState<{ sha: string; code: string } | null>(null)
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

  // The vendor's SIGNED identity, not the client's record of them. The issued
  // PDF is built from vendor_authorizations, so reading the client's row here
  // was how the on-screen sheet and the issued document could disagree on a
  // name. One hook, both paths, same shape.
  //
  // Above the not-found return for the same reason as TransactionDetail: a hook
  // below an early return makes the first render call fewer hooks than the
  // second, and React tears the page down. Disabled while `t` is undefined.
  const { data: auth, isLoading: authLoading } = useReceiptAuthorization(t?.id)

  if (!t) {
    return (
      <div className="space-y-3">
        <Link to="/" className="text-body font-semibold text-ink-500">← กลับรายการ</Link>
        <p>ไม่พบรายการ</p>
      </div>
    )
  }
  const sig = signatureState(t, auth?.signaturePng, { loading: authLoading })
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

  const downloadIssued = async () => {
    setErr('')
    setBusy(true)
    try {
      const { blob, filename, headers } = await apiDownload(`/api/client/transactions/${t.id}/receipt.pdf`)
      saveBlob(blob, filename || `${number}.pdf`)
      setIssuedFile({ sha: headers['x-pdf-sha256'] ?? '', code: headers['x-verification-code'] ?? '' })
    } catch {
      setErr('ดาวน์โหลดใบเสร็จฉบับออกจริงไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const downloadSnapshot = async () => {
    setErr('')
    if (!sheetRef.current) return
    setBusy(true)
    try {
      const name = documentFileName({
        number,
        vendorName: t.vendor.name,
        amount: t.grossAmount,
      })
      await downloadElementAsA4Pdf(sheetRef.current, name)
    } catch {
      setErr('ดาวน์โหลดใบเสร็จไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
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
          {!issued && !isVoid && <span className="text-body font-medium text-warning">· รอออกเลขที่ใบเสร็จ</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status === 'issued' && hasServer ? (
            <Button onClick={downloadIssued} loading={busy} title="ใบเสร็จฉบับออกจริง — มีลายเซ็นผู้ขายและ SHA-256 ที่บันทึกไว้">
              <Download size={15} /> {busy ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดใบเสร็จฉบับออกจริง'}
            </Button>
          ) : (
            <Button
              onClick={downloadSnapshot}
              loading={busy}
              title="ภาพหน้าจอของใบเสร็จ — ยังไม่มีลายเซ็นและไม่มีรหัสตรวจสอบ จึงใช้แทนใบเสร็จจริงไม่ได้"
            >
              <ImageDown size={15} /> {busy ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดใบเสร็จ'}
            </Button>
          )}
        </div>
      </div>
      {err && <p className="no-print text-body font-medium text-danger">{err}</p>}

      {/* Proof the accountant hands over: verification code + digest of the
          issued file. Only meaningful once the receipt has actually been issued. */}
      {issuedFile && (issuedFile.code || issuedFile.sha) && (
        <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border border-card-border bg-ink-50 px-3 py-2 text-label text-ink-600">
          <Info size={14} className="shrink-0 text-ink-400" aria-hidden />
          {issuedFile.code && (
            <span>
              รหัสตรวจสอบ: <span className="font-mono font-semibold">{issuedFile.code}</span>
            </span>
          )}
          {issuedFile.sha && (
            <span className="min-w-0">
              SHA-256: <span className="font-mono">{issuedFile.sha.slice(0, 16)}…</span>
            </span>
          )}
        </div>
      )}

      <div className="print-area relative">
        <div ref={wrapRef} className="w-full">
          <div ref={sheetRef} style={{ zoom }} className="receipt-sheet relative flex flex-col overflow-hidden rounded-card border border-card-border bg-white font-[Sarabun] shadow-card">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" />
          {isVoid && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="rotate-[-18deg] rounded-control border-4 border-danger px-8 py-2 text-4xl font-semibold text-danger/70">VOID</span>
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

          {/*
            Signature block.

            Previously this always drew the signature rule, the "ผู้มีอำนาจลงนาม"
            caption and the vendor's name, and only the <img> was conditional —
            so a receipt with no signature was indistinguishable from a properly
            signed one, reading as a missing scan. Each state now says what is
            actually true, and the rule + name are drawn ONLY when there is a
            real signature behind them.
          */}
          <div className="mt-auto flex justify-center pt-10">
            {sig.kind === 'unsigned' ? (
              <div className="w-[260px] text-center">
                <div className="flex h-14 items-center justify-center text-label text-ink-400">
                  {SIGNATURE_COPY.unsigned.title}
                </div>
                <p className="text-label text-ink-400">{SIGNATURE_COPY.unsigned.detail}</p>
              </div>
            ) : sig.kind === 'loading' ? (
              <div className="w-[260px] text-center">
                <div className="flex h-14 items-center justify-center gap-2 text-label text-ink-400">
                  <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-ink-100" aria-hidden />
                  {SIGNATURE_COPY.loading.title}
                </div>
              </div>
            ) : sig.kind === 'missing' ? (
              <div className="w-[300px] text-center">
                <div className="flex h-14 items-center justify-center">
                  <FileText size={22} className="text-ink-300" aria-hidden />
                </div>
                <p className="text-body font-semibold text-warning">{SIGNATURE_COPY.missing.title}</p>
                <p className="mt-0.5 text-label text-ink-500">{SIGNATURE_COPY.missing.detail}</p>
                {t.status === 'issued' && hasServer && (
                  <Button variant="secondary" className="no-print mt-2" onClick={downloadIssued} loading={busy}>
                    <Download size={14} /> ดาวน์โหลดฉบับออกจริง
                  </Button>
                )}
              </div>
            ) : (
              <div className="w-[260px] text-center">
                <div className="flex h-14 items-end justify-center">
                  <img src={sig.png} alt="ลายเซ็นผู้มีอำนายลงนาม" className="max-h-14 object-contain" />
                </div>
                <p className="border-t border-ink-300 pt-2 text-body font-semibold">ผู้มีอำนาจลงนาม</p>
                <p className="text-label text-ink-400">{vendorDisplayName(vendorPrefix, vendorName)}</p>
                {auth?.signedAt && (
                  <p className="mt-0.5 text-micro text-ink-400">ลงนามเมื่อ {fmtDateTH(auth.signedAt.slice(0, 10))}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
