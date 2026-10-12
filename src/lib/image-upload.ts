// Client-side preparation of vendor document photos before upload.
//
// Phone cameras produce 5–12 MB JPEG/HEIC files; the server accepts only
// png/jpeg/webp data URLs up to 5 MB. We decode in the browser (which also
// handles HEIC on iOS), downscale, and re-encode to JPEG so the upload is small,
// correctly oriented, and always in a format the server accepts.

export interface PreparedImage {
  dataUrl: string
  /** A friendly file name — never the camera's IMG_1234.HEIC. */
  name: string
  bytes: number
}

export interface PrepareOptions {
  /** Longest edge of the output, in px. */
  maxDim?: number
  /** Initial JPEG quality (0–1). */
  quality?: number
  /** Target ceiling for the encoded bytes; quality steps down to reach it. */
  maxBytes?: number
  /** Friendly output name (extension is always .jpg). */
  name?: string
}

// Formats the server's dataUrlBytes() already accepts, so an already-small file
// can be passed through unchanged when the browser cannot decode it.
const ACCEPTED = /^image\/(png|jpe?g|webp)$/i
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024

/** Scale (w, h) so the longest edge is at most maxDim, preserving aspect ratio. */
export function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number } {
  const longest = Math.max(w, h)
  if (longest <= maxDim || longest === 0) return { w, h }
  const scale = maxDim / longest
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** Decoded byte length of a base64 data URL. */
export function dataUrlSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const b64 = dataUrl.length - comma - 1
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64 * 3) / 4) - padding)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read-failed'))
    r.readAsDataURL(file)
  })
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // { imageOrientation: 'from-image' } is the spec default but is passed
      // explicitly so an EXIF-rotated photo is not drawn sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode-failed'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscale + re-encode a photo for upload. Throws `unsupported-image` when the
 * browser cannot decode it and it is not already a server-accepted format.
 */
export async function prepareUpload(file: File, opts: PrepareOptions = {}): Promise<PreparedImage> {
  const { maxDim = 1600, quality = 0.82, maxBytes = DEFAULT_MAX_BYTES, name = 'photo.jpg' } = opts

  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await decode(file)
  } catch {
    // Undecodable (e.g. HEIC on desktop Chrome): pass through only if it is
    // already acceptable and within the target.
    if (ACCEPTED.test(file.type) && file.size <= maxBytes) {
      return { dataUrl: await fileToDataUrl(file), name, bytes: file.size }
    }
    throw new Error('unsupported-image')
  }

  const sw = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
  const sh = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height
  const { w, h } = fitWithin(sw, sh, maxDim)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('unsupported-image')
  ctx.drawImage(bitmap, 0, 0, w, h)
  if ('close' in bitmap) bitmap.close()

  let q = quality
  let dataUrl = canvas.toDataURL('image/jpeg', q)
  while (dataUrlSize(dataUrl) > maxBytes && q > 0.4) {
    q = Math.round((q - 0.1) * 100) / 100
    dataUrl = canvas.toDataURL('image/jpeg', q)
  }

  return { dataUrl, name, bytes: dataUrlSize(dataUrl) }
}
