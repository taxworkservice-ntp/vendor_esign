import { forwardRef, type CSSProperties } from 'react'
import { vendorDisplayName } from '../../lib/vendor-name'

// Page 2 of a receipt: the payee's ID-card photo, attached so each transaction's
// document is two pages (receipt + ID). Presentational — rendered on screen and
// printed directly, and captured for the PDF download. The image is marked
// data-role="overlay" so the raster export composites it from a decoded image
// (WebKit silently drops nested images from the html-to-image SVG).
export const ReceiptAttachmentPage = forwardRef<
  HTMLDivElement,
  {
    number: string
    prefix?: string
    vendorName: string
    src: string
    style?: CSSProperties
  }
>(function ReceiptAttachmentPage({ number, prefix, vendorName, src, style }, ref) {
  const title = vendorDisplayName(prefix, vendorName)
  return (
    <div
      ref={ref}
      style={style}
      className="receipt-attachment relative flex flex-col overflow-hidden rounded-card border border-card-border bg-white font-[Sarabun] shadow-card"
    >
      <div className="shrink-0 border-b border-card-border pb-2.5">
        <p className="text-micro font-semibold tracking-[0.14em] text-ink-400">เอกสารแนบ</p>
        <h2 className="mt-1 text-title font-semibold">รูปบัตรประชาชนผู้รับเงิน</h2>
        <p className="mt-1 text-body text-ink-600">
          ใบเสร็จเลขที่ <span className="font-mono font-semibold text-ink-900">{number}</span>
          {title ? ` · ${title}` : ''}
        </p>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-control bg-ink-50 p-3">
        <img
          src={src}
          alt="รูปบัตรประชาชนผู้รับเงิน"
          data-role="overlay"
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  )
})
