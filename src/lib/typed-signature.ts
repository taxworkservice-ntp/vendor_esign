import { colors } from '../design/tokens'

// "Type to sign": render a typed name as a signature image, so a vendor who
// cannot or will not draw with mouse/touch can still authorize. The output is a
// PNG data URL — the same shape the drawn pad produces — so storage and the
// receipt pipeline are unchanged.

export const SIGNATURE_FONT = "'Mali', 'Sriracha', 'Segoe Script', cursive"

/** The label stored in vendor_authorizations.verification_method for each path. */
export const SIGN_METHOD_LABEL: Record<string, string> = {
  'stub-deferred': 'ลายเซ็น (วาดด้วยนิ้ว/เมาส์)',
  'typed-consent': 'ลงนามด้วยการพิมพ์ชื่อ',
  'uploaded-signature': 'ลายเซ็นจากไฟล์ที่อัปโหลด',
  'line-liff': 'ยืนยันด้วย LINE',
}

export function signMethodLabel(method: string | undefined | null): string {
  return (method && SIGN_METHOD_LABEL[method]) || 'ลายเซ็น'
}

/** Padding around the ink as a fraction of the font size (breathing room). */
export const TYPED_SIGNATURE_PADDING_RATIO = 0.28
/** Largest font size the name is drawn at, before shrink-to-fit. */
export const TYPED_SIGNATURE_MAX_SIZE = 48
/** Smallest size the name shrinks to for an unusually long name. */
export const TYPED_SIGNATURE_MIN_SIZE = 15
/** Ink width the name may occupy before it is scaled down, in CSS px. */
export const TYPED_SIGNATURE_MAX_WIDTH = 820

export interface TypedSignatureMetrics {
  /** Measured advance width of the text at `size`. */
  advance: number
  /** Ink above the alphabetic baseline. */
  ascent: number
  /** Ink below the alphabetic baseline. */
  descent: number
  /** Final font size the metrics were measured at. */
  size: number
}

export interface TypedSignatureLayout {
  /** Canvas width in CSS px — the advance plus padding. */
  width: number
  /** Canvas height in CSS px — the ink plus padding. */
  height: number
  /** x to pass to fillText with textAlign='center'. */
  x: number
  /** y to pass to fillText with textBaseline='alphabetic'. */
  y: number
}

/**
 * Lay the name out in a canvas cropped to its advance and ink.
 *
 * The name is centred on its **advance width**, not on `actualBoundingBoxLeft/
 * Right`. Those two are unreliable in some engines (Safari in particular) and,
 * because the old code used them for both the canvas width and the draw origin,
 * a bad value made the name drift right and clip. The advance is stable across
 * engines. The vertical crop still uses the measured ink box.
 *
 * The result is deterministic and identical on screen, in the raster PDF, and
 * in the server PDF.
 */
export function fitTypedSignature(m: TypedSignatureMetrics): TypedSignatureLayout {
  const pad = Math.max(6, Math.round(m.size * TYPED_SIGNATURE_PADDING_RATIO))
  const width = Math.ceil(m.advance + pad * 2)
  const height = Math.ceil(m.ascent + m.descent + pad * 2)
  return { width, height, x: width / 2, y: pad + m.ascent }
}

// Fallbacks when `actualBoundingBox*` is unavailable (older engines): approximate
// from the em size. Keeping the crop honest matters more than a perfect box.
const ASCENT_RATIO = 0.82
const DESCENT_RATIO = 0.24

/**
 * Render `name` in the handwriting face and return a PNG data URL cropped to
 * the strokes. Waits for the web font, otherwise the canvas would capture a
 * fallback face. The name is drawn navy ink on transparent so it reads like a
 * signature, not a headline.
 */
export async function renderTypedSignature(name: string): Promise<string> {
  const text = name.trim()
  const dpr = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-2d-context')

  // Make sure the handwriting face is loaded before measuring/drawing.
  try {
    await document.fonts.load(`64px ${SIGNATURE_FONT}`)
    await document.fonts.ready
  } catch {
    /* older browsers: fall through and draw with whatever is available */
  }

  // Shrink to fit the max width, measuring with the face in place.
  let size = TYPED_SIGNATURE_MAX_SIZE
  ctx.font = `${size}px ${SIGNATURE_FONT}`
  const advance0 = ctx.measureText(text).width
  if (advance0 > TYPED_SIGNATURE_MAX_WIDTH) {
    size = Math.max(TYPED_SIGNATURE_MIN_SIZE, Math.floor(size * (TYPED_SIGNATURE_MAX_WIDTH / advance0)))
    ctx.font = `${size}px ${SIGNATURE_FONT}`
  }

  // Centre on the advance width; only the vertical crop uses the ink box.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText(text)
  const ascent = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * ASCENT_RATIO
  const descent = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * DESCENT_RATIO
  const layout = fitTypedSignature({ advance: m.width, ascent, descent, size })

  canvas.width = layout.width * dpr
  canvas.height = layout.height * dpr
  // Resizing the canvas resets the context, so re-apply state after.
  ctx.scale(dpr, dpr)
  ctx.font = `${size}px ${SIGNATURE_FONT}`
  ctx.fillStyle = colors.signature
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, layout.x, layout.y)
  return canvas.toDataURL('image/png')
}
