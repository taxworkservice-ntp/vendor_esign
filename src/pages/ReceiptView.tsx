import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Info } from 'lucide-react'
import { useTransaction } from '../hooks/useTransactions'
import { useReceiptAuthorization } from '../hooks/useReceiptAuthorization'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import { mockReceiptNumber } from '../lib/receipt'
import { signatureState, isSigned } from '../lib/signature-state'
import { apiDownload, hasServer, saveBlob } from '../lib/api-client'
import { documentFileName } from '../lib/download-name'
import { receiptSheetToA4PdfBytes, sha256Hex } from '../lib/receipt-to-a4-pdf'
import { normalizeLineItem } from '../lib/line-items'
import { ReceiptSheet, type ReceiptSheetData } from '../components/receipt/receipt-sheet'
import { Button } from '../components/ui/button'
import { StatusBadge } from '../components/ui/badge'
import type { LineItem } from '../lib/types'

// Number/code derivation lives in lib/receipt (mock) — the real backend assigns
// the series number inside the finalization txn + random verification code.

export function ReceiptView() {
  const { id } = useParams()
  const { data: t } = useTransaction(id)
  const { data: settings } = useSettings()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(1)
  // The issued PDF is the statutory artifact built server-side. The normal
  // download is a raster of this exact sheet; the server file is only offered
  // when the signature image itself could not be loaded (see below).
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
  }, [t?.id])

  // The vendor's SIGNED identity, not the client's record of them. The hook is
  // called above the not-found return so every render calls the same hooks.
  const { data: auth, isLoading: authLoading, refetch: refetchAuth } = useReceiptAuthorization(t?.id)

  // Self-heal: a signed receipt whose signature has not resolved may be a
  // transient read (mock IndexedDB write, storage blip). Retry once per txn
  // instead of showing the terminal "download the issued PDF" copy.
  const healedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (authLoading || !t || !isSigned(t) || auth?.signaturePng) return
    if (healedRef.current.has(t.id)) return
    healedRef.current.add(t.id)
    const timer = setTimeout(() => void refetchAuth(), 400)
    return () => clearTimeout(timer)
  }, [authLoading, auth?.signaturePng, t, refetchAuth])

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
  // A receipt number exists only once the receipt is issued. Never fabricate one
  // for a merely-signed row — it would disagree with the number the client gets.
  // The mock fallback stays for seeded mock rows only (no server).
  const number =
    t.receiptNumber ?? (t.status === 'issued' && !hasServer ? mockReceiptNumber(t.id, t.vendor.vendorNo ?? 0) : 'ยังไม่ออกเลข')
  const isVoid = t.status === 'void'
  // The buyer is the workspace (the client), from real settings — not the mock
  // client registry, which only knew the demo tenants.
  const s = settings ?? defaultSettings(t.tenantId)
  const client = { displayName: s.displayName, address: s.address, taxId: s.taxId }
  const items: LineItem[] = (
    t.lineItems?.some((it) => it.description || it.amount)
      ? t.lineItems
      : [{ description: t.description, amount: t.grossAmount }]
  ).map(normalizeLineItem)

  const data: ReceiptSheetData = {
    number,
    transferDate: t.transferDate,
    issueDate: t.receiptIssueDate,
    items,
    grossAmount: t.grossAmount,
    whtRate: t.whtRate,
    whtAmount: t.whtAmount,
    netAmount: t.netAmount,
    note: t.note,
    isVoid,
    voidReason: t.voidReason,
    client,
    vendor: {
      prefix: auth ? auth.vendorPrefix : t.vendor.prefix,
      name: auth?.vendorName ?? t.vendor.name,
      address: auth?.vendorAddress ?? t.vendor.address,
      phone: auth?.vendorPhone || t.vendor.phone,
      email: auth?.vendorEmail || t.vendor.email,
      taxId: t.vendor.taxId,
      maskedId: t.vendor.maskedId,
    },
    sig,
    signedAt: auth?.signedAt,
    sigMethod: auth?.verificationMethod,
    verificationCode: t.verificationCode,
    verifyUrl: t.verificationCode ? `${window.location.origin}/verify/${t.verificationCode}` : undefined,
  }

  // Fallback only: the server's pdf-lib artifact embeds the signature even when
  // the image cannot be fetched, so it is the right document in that one case.
  const downloadIssued = async () => {
    setErr('')
    setBusy(true)
    try {
      const { blob, filename } = await apiDownload(`/api/client/transactions/${t.id}/receipt.pdf`)
      saveBlob(blob, filename || `${number}.pdf`)
    } catch {
      setErr('ดาวน์โหลดใบเสร็จฉบับออกจริงไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  // The normal download: rasterise the sheet on screen so the PDF is identical
  // to the preview (layout + Thai shaping), in every browser.
  const downloadCopy = async () => {
    setErr('')
    if (!sheetRef.current) return
    // Never rasterise a sheet whose signature has not resolved — that would ship
    // an unsigned PDF. If the image is genuinely missing, the archived server
    // artifact (which embeds it) is the correct document instead.
    if (sig.kind !== 'ready') {
      if (hasServer) return downloadIssued()
      setErr('ลายเซ็นยังไม่พร้อม — โปรดลองอีกครั้ง')
      return
    }
    setBusy(true)
    try {
      const bytes = await receiptSheetToA4PdfBytes(sheetRef.current)
      const name = documentFileName({ number, vendorName: t.vendor.name, amount: t.grossAmount })
      saveBlob(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), name)
      // The digest shown is of the file just downloaded, not the server artifact.
      if (t.status === 'issued') {
        setIssuedFile({ sha: await sha256Hex(bytes), code: t.verificationCode ?? '' })
      }
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
          <Button
            onClick={downloadCopy}
            loading={busy}
            disabled={authLoading || sig.kind === 'unsigned'}
            title={
              authLoading
                ? 'กำลังโหลดลายเซ็น…'
                : sig.kind === 'unsigned'
                  ? 'ยังไม่ได้ลงนาม — ยังไม่มีใบเสร็จให้ดาวน์โหลด'
                  : 'ไฟล์ PDF ที่ตรงกับตัวอย่างบนหน้าจอ'
            }
          >
            <Download size={15} /> {authLoading ? 'กำลังโหลดลายเซ็น…' : busy ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดใบเสร็จ'}
          </Button>
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
          <ReceiptSheet
            ref={sheetRef}
            style={{ zoom }}
            data={data}
            missingAction={
              t.status === 'issued' && hasServer ? (
                <Button variant="secondary" className="no-print mt-2" onClick={downloadIssued} loading={busy}>
                  <Download size={14} /> ดาวน์โหลดฉบับออกจริง
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}
