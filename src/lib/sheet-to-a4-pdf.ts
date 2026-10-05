import { toCanvas } from 'html-to-image'

// Snapshot a DOM sheet onto one A4 page, using the browser's own layout engine
// (SVG foreignObject via html-to-image) so the PDF is pixel-for-pixel the same
// as the preview — including Thai shaping and the exact text baseline.
//
// The previous html2canvas path re-drew text itself and drifted vertically on
// the WHT form; this does not.

/** Wait for web fonts + in-document <img>s so nothing renders blank. */
async function ready(el: HTMLElement): Promise<void> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    /* older browsers */
  }
  const images = Array.from(el.querySelectorAll('img'))
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

/** Rasterise `el` onto a single A4 page and return the PDF bytes. */
export async function sheetToA4PdfBytes(el: HTMLElement): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  await ready(el)
  const canvas = await toCanvas(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    // Must stay off: a cache-bust query appended after a presigned URL's
    // X-Amz-Signature invalidates the signature (R2 then 403s without CORS).
    cacheBust: false,
  })
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
  return new Uint8Array(pdf.output('arraybuffer'))
}
