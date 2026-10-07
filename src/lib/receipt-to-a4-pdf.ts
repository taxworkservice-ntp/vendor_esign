import { captureElement, readyForCapture } from './capture'
import { drawContain, loadImage, type OverlayImage } from './raster-image'

/**
 * Snapshot the on-screen receipt sheet onto one A4 page.
 *
 * This is the single download path for receipts — the same DOM the operator
 * sees, rasterised with html-to-image, so the PDF matches the preview exactly
 * (layout, Sarabun, Thai shaping). The old server pdf-lib renderer drifted in
 * layout and could not position Thai combining marks; it is now kept only as
 * the internal/audit artifact.
 *
 * The signature is captured separately and drawn onto the canvas from a decoded
 * image (`data-role="overlay"`). html-to-image serialises the sheet into an SVG
 * data URL and re-decodes it; a nested signature data URL can be dropped by
 * WebKit on the first capture — the preview showed a signature the Safari
 * download did not. Drawing it ourselves removes that engine behaviour from the
 * path, so every browser produces the same PDF.
 */
export async function receiptSheetToA4PdfBytes(el: HTMLElement): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  // Neutralise the on-screen fit-to-width zoom and screen chrome for the capture.
  const prevZoom = el.style.zoom
  el.style.zoom = '1'
  el.classList.add('pdf-export')
  try {
    await readyForCapture(el)
    const overlay = measureOverlay(el)
    const canvas = await captureElement(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      // Screen-only affordances (e.g. the fallback download button) and the
      // signature overlay must not appear in the captured SVG.
      filter: (node) => !node.classList?.contains('no-print') && node.dataset?.role !== 'overlay',
    })
    if (overlay) {
      const img = await loadImage(overlay.src)
      const ctx = canvas.getContext('2d')
      if (ctx) drawContain(ctx, img, overlay, 2)
    }
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
    return new Uint8Array(pdf.output('arraybuffer'))
  } finally {
    el.classList.remove('pdf-export')
    el.style.zoom = prevZoom
  }
}

/** The signature image inside the sheet, positioned relative to the sheet. */
function measureOverlay(el: HTMLElement): OverlayImage | null {
  const img = el.querySelector<HTMLImageElement>('img[data-role="overlay"]')
  if (!img?.src) return null
  const sheet = el.getBoundingClientRect()
  const r = img.getBoundingClientRect()
  if (!r.width || !r.height) return null
  return { src: img.src, x: r.left - sheet.left, y: r.top - sheet.top, w: r.width, h: r.height }
}

/** SHA-256 (hex) of the bytes we hand the user, so the receipt banner is honest. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
