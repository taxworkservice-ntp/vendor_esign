import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ReceiptSheet, type ReceiptSheetData } from './receipt-sheet'
import { apiDownload } from '../../lib/api-client'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'

// The vendor's receipt copy, shown inline over the signing page so the vendor
// never navigates away. With the just-signed snapshot (or the rebuilt return
// visit) it renders the exact sheet the client sees; only when the signature
// could not be loaded does it fall back to the archived PDF — fetched as a blob
// so it renders inline (the raw endpoint sends `Content-Disposition: attachment`,
// which browsers refuse to frame).
export function ReceiptCopyDialog({
  open,
  data,
  pdfPath,
  onClose,
}: {
  open: boolean
  data: ReceiptSheetData | null
  pdfPath?: string
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfErr, setPdfErr] = useState(false)

  // Fit the fixed A4 sheet to the dialog width (never scale up past 100%).
  useEffect(() => {
    const el = wrapRef.current
    if (!open || !el || !data) return
    const A4_PX = 794 // 210mm @ 96dpi
    const update = () => setZoom(Math.min(1, el.clientWidth / A4_PX))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, data])

  // Fallback: no snapshot → load the archived PDF as an object URL so it can be
  // shown inline without the attachment disposition blocking it.
  useEffect(() => {
    if (!open || data || !pdfPath) return
    let cancelled = false
    setPdfErr(false)
    void (async () => {
      try {
        const { blob } = await apiDownload(pdfPath)
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        blobRef.current = url
        setPdfBlobUrl(url)
      } catch {
        if (!cancelled) setPdfErr(true)
      }
    })()
    return () => {
      cancelled = true
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [open, data, pdfPath])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-copy-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-[210mm]">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="receipt-copy-title" className="text-title font-semibold">สำเนาใบเสร็จ</h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="ปิดสำเนาใบเสร็จ"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100"
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          <div ref={wrapRef} className="max-h-[70vh] overflow-y-auto rounded-control bg-ink-50 p-2">
            {data ? (
              <ReceiptSheet style={{ zoom }} data={data} />
            ) : pdfBlobUrl ? (
              <iframe
                title="สำเนาใบเสร็จ (PDF)"
                src={pdfBlobUrl}
                className="h-[70vh] w-full rounded-control border-0 bg-white"
              />
            ) : pdfErr ? (
              <p className="p-8 text-center text-body text-ink-500">ไม่สามารถแสดงสำเนาได้ — กรุณาดาวน์โหลดใบเสร็จ</p>
            ) : (
              <p className="p-8 text-center text-body text-ink-500">กำลังโหลดสำเนา…</p>
            )}
          </div>

          <div className="flex justify-end border-t border-card-border pt-3">
            <Button variant="secondary" onClick={onClose}>ปิด</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
