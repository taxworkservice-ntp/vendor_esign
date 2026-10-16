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
export async function receiptSheetToA4PdfBytes(
  el: HTMLElement,
  attachmentEl?: HTMLElement,
): Promise<Uint8Array> {
  return elementToA4PdfBytes(el, {
    // Screen-only affordances (e.g. the fallback download button) and the
    // signature overlay must not appear in the captured SVG.
    filter: (node) => !node.classList?.contains('no-print') && node.dataset?.role !== 'overlay',
    beforePdf: async (canvas) => {
      const overlay = measureOverlay(el)
      if (!overlay) return
      try {
        const img = await loadImage(overlay.src)
        const ctx = canvas.getContext('2d')
        if (ctx) drawContain(ctx, img, overlay, 2)
      } catch {
        // A broken signature overlay must not abort the sheet capture; the
        // caller falls back to the server-archived PDF instead.
      }
    },
    // Page 2: the payee's ID-card photo, captured from the same on-screen page
    // that prints, so screen/print/download stay identical.
    extraPages: attachmentEl ? [attachmentEl] : undefined,
  })
}

/**
 * Rasterise any on-screen element onto a single A4 page (jsPDF over an
 * html-to-image canvas). Shared by the receipt sheet and the onboarding
 * submission evidence. `filter` drops screen-only nodes; `beforePdf` lets the
 * caller composite extra layers (e.g. a signature) before the PDF is written.
 */
const A4_W = 595.28
const A4_H = 841.89
const A4_MARGIN = 36 // 0.5in

export async function elementToA4PdfBytes(
  el: HTMLElement,
  opts: {
    filter?: (node: HTMLElement) => boolean
    beforePdf?: (canvas: HTMLCanvasElement) => void | Promise<void>
    /**
     * How the capture fills the A4 page:
     *  - 'stretch' (default): fills the whole page, ignoring aspect ratio — for
     *    A4-proportioned sheets (the receipt) where that is intentional.
     *  - 'contain': preserves the element's aspect ratio, scaled to fit the page
     *    with a margin and top-centred — for short content (the onboarding
     *    evidence card) that would otherwise be distorted by stretching.
     */
    fit?: 'stretch' | 'contain'
    /**
     * Additional pages appended after the first, each captured from its own
     * on-screen element and stretched to a full A4 page (used for the receipt's
     * ID-card attachment page). Overlay images are composited the same way.
     */
    extraPages?: HTMLElement[]
  } = {},
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })

  // Capture one A4-proportioned element to a canvas, neutralising the on-screen
  // fit-to-width zoom + chrome, and compositing any overlay images.
  const capturePage = async (target: HTMLElement, compose: (c: HTMLCanvasElement) => void | Promise<void>) => {
    const prevZoom = target.style.zoom
    target.style.zoom = '1'
    target.classList.add('pdf-export')
    try {
      await readyForCapture(target)
      const canvas = await captureElement(target, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: opts.filter ?? ((node) => !node.classList?.contains('no-print')),
      })
      await compose(canvas)
      return canvas
    } finally {
      target.classList.remove('pdf-export')
      target.style.zoom = prevZoom
    }
  }

  const canvas = await capturePage(
    el,
    opts.beforePdf ?? ((c) => compositeOverlays(c, el)),
  )
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
  if (opts.fit === 'contain' && canvas.width > 0 && canvas.height > 0) {
    const ratio = canvas.height / canvas.width
    let w = A4_W - A4_MARGIN * 2
    let h = w * ratio
    if (h > A4_H - A4_MARGIN * 2) {
      h = A4_H - A4_MARGIN * 2
      w = h / ratio
    }
    pdf.addImage(dataUrl, 'JPEG', (A4_W - w) / 2, A4_MARGIN, w, h)
  } else {
    pdf.addImage(dataUrl, 'JPEG', 0, 0, A4_W, A4_H)
  }
  for (const extra of opts.extraPages ?? []) {
    const c = await capturePage(extra, (cv) => compositeOverlays(cv, extra))
    pdf.addPage('a4', 'portrait')
    pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_W, A4_H)
  }
  return new Uint8Array(pdf.output('arraybuffer'))
}

/** Draw every `img[data-role="overlay"]` in `target` onto the captured canvas,
 *  positioned by its on-screen box (object-fit: contain). */
async function compositeOverlays(canvas: HTMLCanvasElement, target: HTMLElement): Promise<void> {
  const imgs = Array.from(target.querySelectorAll<HTMLImageElement>('img[data-role="overlay"]'))
  if (!imgs.length) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const base = target.getBoundingClientRect()
  if (!base.width || !base.height) return
  const sx = canvas.width / base.width
  const sy = canvas.height / base.height
  for (const img of imgs) {
    if (!img.src) continue
    const r = img.getBoundingClientRect()
    if (!r.width || !r.height) continue
    try {
      const loaded = await loadImage(img.src)
      drawContain(ctx, loaded, { src: img.src, x: (r.left - base.left) * sx, y: (r.top - base.top) * sy, w: r.width * sx, h: r.height * sy }, 1)
    } catch {
      /* broken attachment image: leave the page without it */
    }
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
