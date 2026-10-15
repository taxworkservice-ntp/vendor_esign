import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ReceiptSheet, type ReceiptSheetData } from './receipt-sheet'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'

// The vendor's receipt copy, shown inline over the signing page so the vendor
// never navigates away. With the just-signed snapshot it renders the exact sheet
// the client sees; on a return visit it embeds the archived server PDF (the only
// signature-bearing artifact available once the snapshot is gone).
export function ReceiptCopyDialog({
  open,
  data,
  pdfUrl,
  onClose,
}: {
  open: boolean
  data: ReceiptSheetData | null
  pdfUrl?: string
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

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
            ) : pdfUrl ? (
              <object data={pdfUrl} type="application/pdf" className="h-[70vh] w-full rounded-control bg-white">
                <iframe title="สำเนาใบเสร็จ (PDF)" src={pdfUrl} className="h-[70vh] w-full rounded-control border-0" />
              </object>
            ) : (
              <p className="p-8 text-center text-body text-ink-500">ไม่พบสำเนาใบเสร็จ</p>
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
