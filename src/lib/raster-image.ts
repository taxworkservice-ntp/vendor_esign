// Shared image helpers for the client-side raster export path (receipt + WHT).
//
// The core problem they solve: html-to-image serialises the DOM into an SVG data
// URL and re-decodes it. A large image nested in that SVG (a signature, a stamp)
// can be silently dropped by WebKit on the first capture — the preview shows it,
// the downloaded PDF does not. Pre-decoding the image and drawing it onto the
// output canvas ourselves removes the browser's SVG image handling from the path
// entirely, so the result is identical on every engine.

/** A decoded image plus where to draw it, in the captured element's CSS px. */
export interface OverlayImage {
  src: string
  x: number
  y: number
  w: number
  h: number
  opacity?: number
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()

/** Fetch + decode an image once, keeping it cached and alive for the page. */
export function loadImage(src: string): Promise<HTMLImageElement> {
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

/** Draw an image with object-fit: contain inside a box (default 50% 50% anchor). */
export function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: OverlayImage,
  ratio: number,
): void {
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
