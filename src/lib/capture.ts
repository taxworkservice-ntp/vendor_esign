import { toCanvas } from 'html-to-image'

// Shared DOM-capture helpers so the WHT form and the receipt rasterise through
// the exact same, browser-accurate path (jsPDF over an html-to-image canvas).

/** Wait for web fonts + in-document <img>s so a capture is never blank. */
export async function readyForCapture(el: HTMLElement): Promise<void> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    /* older browsers */
  }
  const images = Array.from(el.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      }
      // `complete` means bytes arrived; `decode()` means it is ready to draw.
      try {
        await img.decode?.()
      } catch {
        /* decode unsupported or failed; draw anyway */
      }
    }),
  )
}

export interface CaptureOptions {
  pixelRatio?: number
  backgroundColor?: string
  filter?: (node: HTMLElement) => boolean
}

/** Rasterise `el` with html-to-image (browser-accurate layout + Thai shaping). */
export function captureElement(el: HTMLElement, opts: CaptureOptions = {}): Promise<HTMLCanvasElement> {
  return toCanvas(el, {
    pixelRatio: opts.pixelRatio ?? 2,
    backgroundColor: opts.backgroundColor ?? '#ffffff',
    // Must stay off: a cache-bust query appended after a presigned URL's
    // X-Amz-Signature invalidates the signature (R2 then 403s without CORS).
    cacheBust: false,
    filter: opts.filter,
  })
}
