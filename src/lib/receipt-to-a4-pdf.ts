import { captureElement } from './capture'

/**
 * Snapshot the on-screen receipt sheet onto one A4 page.
 *
 * This is the single download path for receipts — the same DOM the operator
 * sees, rasterised with html-to-image, so the PDF matches the preview exactly
 * (layout, Sarabun, Thai shaping). The old server pdf-lib renderer drifted in
 * layout and could not position Thai combining marks; it is now kept only as
 * the internal/audit artifact.
 */
export async function receiptSheetToA4PdfBytes(el: HTMLElement): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  // Neutralise the on-screen fit-to-width zoom and screen chrome for the capture.
  const prevZoom = el.style.zoom
  el.style.zoom = '1'
  el.classList.add('pdf-export')
  try {
    const canvas = await captureElement(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      // Screen-only affordances (e.g. the fallback download button) must not
      // appear in the PDF.
      filter: (node) => !node.classList?.contains('no-print'),
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
    return new Uint8Array(pdf.output('arraybuffer'))
  } finally {
    el.classList.remove('pdf-export')
    el.style.zoom = prevZoom
  }
}

/** SHA-256 (hex) of the bytes we hand the user, so the receipt banner is honest. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
