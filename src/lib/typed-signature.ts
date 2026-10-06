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

/**
 * Render `name` centred on a transparent canvas in the handwriting face and
 * return a PNG data URL. Waits for the web font, otherwise the canvas would
 * capture a fallback face.
 */
export async function renderTypedSignature(name: string): Promise<string> {
  const text = name.trim()
  const W = 900
  const H = 260
  const dpr = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-2d-context')
  ctx.scale(dpr, dpr)

  // Make sure the handwriting face is loaded before measuring/drawing.
  try {
    await document.fonts.load(`64px ${SIGNATURE_FONT}`)
    await document.fonts.ready
  } catch {
    /* older browsers: fall through and draw with whatever is available */
  }

  let size = 96
  ctx.font = `${size}px ${SIGNATURE_FONT}`
  let w = ctx.measureText(text).width
  const maxW = W - 80
  if (w > maxW) {
    size = Math.max(28, Math.floor(size * (maxW / w)))
    ctx.font = `${size}px ${SIGNATURE_FONT}`
    w = ctx.measureText(text).width
  }

  ctx.fillStyle = colors.ink[900]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, W / 2, H / 2)
  return canvas.toDataURL('image/png')
}
