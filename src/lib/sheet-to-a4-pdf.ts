import { toSvg } from 'html-to-image'
import { readyForCapture } from './capture'
import { BG_IMAGE, PAGE_H, PAGE_W } from './wht-form'

// The WHT form scan is a 3.3 MB PNG. Fetch it once and keep a *decoded*
// HTMLImageElement that the exporter draws straight onto the output canvas.
//
// It must never be inlined into the html-to-image SVG. html-to-image serialises
// the sheet into an SVG data URL (percent-encoded, not base64); a ~4.4 MB image
// data URL nested inside it produces a ~5 MB data URL that Safari cannot
// reliably decode while rasterising, so only Safari dropped the background — and
// only on the first capture, before the browser's decoded cache was warm.
// Compositing the background ourselves removes the race entirely and keeps the
// SVG small.
let bgPromise: Promise<HTMLImageElement> | null = null
export function loadBgImage(): Promise<HTMLImageElement> {
  if (!bgPromise) {
    bgPromise = (async () => {
      const res = await fetch(BG_IMAGE)
      if (!res.ok) throw new Error('bg-fetch-failed')
      // Keep the object URL alive for the page's lifetime: some engines can drop
      // a decoded image's backing store if its blob URL is revoked.
      const url = URL.createObjectURL(await res.blob())
      const img = new Image()
      img.decoding = 'async'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('bg-load-failed'))
        img.src = url
      })
      await img.decode?.().catch(() => undefined)
      return img
    })()
    // Let a later call retry if the first load failed.
    bgPromise.catch(() => {
      bgPromise = null
    })
  }
  return bgPromise
}

/** A signature/stamp drawn by us on the canvas (never inlined into the SVG). */
export interface OverlayImage {
  src: string
  x: number
  y: number
  w: number
  h: number
  opacity?: number
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src)
  if (!p) {
    p = (async () => {
      const img = new Image()
      img.decoding = 'async'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image-load-failed'))
        img.src = src
      })
      await img.decode?.().catch(() => undefined)
      return img
    })()
    p.catch(() => imageCache.delete(src))
    imageCache.set(src, p)
  }
  return p
}

/** Load an SVG data URL as a decoded HTMLImageElement. */
function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      Promise.resolve(img.decode?.())
        .catch(() => undefined)
        .then(() => resolve(img))
    }
    img.onerror = () => reject(new Error('svg-load-failed'))
    img.src = svg
  })
}

/** Draw an image with object-fit: contain inside a box (default 50% 50% anchor). */
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: OverlayImage, ratio: number) {
  if (!img.naturalWidth || !img.naturalHeight) return
  const bw = box.w * ratio
  const bh = box.h * ratio
  const scale = Math.min(bw / img.naturalWidth, bh / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = box.x * ratio + (bw - dw) / 2
  const dy = box.y * ratio + (bh - dh) / 2
  const prev = ctx.globalAlpha
  if (box.opacity != null) ctx.globalAlpha = box.opacity
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.globalAlpha = prev
}

/**
 * Rasterise `el` onto one A4 page. The form background and the signature/stamp
 * (`data-role="form-bg"` / `"overlay"`) are filtered out of the captured SVG and
 * drawn by us from pre-decoded images, so a large nested-data-URL image can never
 * be dropped by Safari on the first capture.
 */
export async function composeSheetToA4Pdf(
  el: HTMLElement,
  bg: HTMLImageElement,
  overlays: OverlayImage[] = [],
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  await readyForCapture(el)
  const width = el.clientWidth || PAGE_W
  const height = el.clientHeight || PAGE_H
  const svg = await toSvg(el, {
    // Must stay off: a cache-bust query appended after a presigned URL's
    // X-Amz-Signature invalidates the signature (R2 then 403s without CORS).
    cacheBust: false,
    filter: (node) => {
      const role = node.dataset?.role
      return role !== 'form-bg' && role !== 'overlay'
    },
  })
  const sheet = await svgToImage(svg)
  const resolved = await Promise.all(overlays.map(async (o) => ({ o, img: await loadImage(o.src) })))

  const ratio = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-2d-context')
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(sheet, 0, 0, canvas.width, canvas.height)
  for (const { o, img } of resolved) drawContain(ctx, img, o, ratio)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
  return new Uint8Array(pdf.output('arraybuffer'))
}
