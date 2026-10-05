import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  CHECKMARK_POS,
  FIELD_LINE_HEIGHT,
  PAGE_H,
  PAGE_W,
  SIGNATURE_H,
  SIGNATURE_LEFT,
  SIGNATURE_TOP,
  SIGNATURE_W,
  STAMP_LEFT,
  STAMP_SIZE,
  STAMP_TOP,
  buildFields,
  cssTop,
  type WhtProfile,
} from './wht-form'
import type { WhtRecordWithVendor } from './wht'

// Vector WHT certificate PDF.
//
// The preview is HTML/CSS; the old download was an html2canvas snapshot, whose
// text baseline did not match the browser's — values sat slightly low on the
// form. This draws the government form as a real PDF instead: the form image as
// the page background and every field as vector text at the exact coordinates,
// so the download matches the preview and stays crisp at any zoom.

const A4_W = 595.28
const A4_H = 841.89
// Scale from the 1512×2138 form space to A4 points (x and y are within 0.02%).
const SX = A4_W / PAGE_W
const SY = A4_H / PAGE_H

export interface WhtPdfAssets {
  /** /wht/form_page_final.png (3024×4276). */
  formPng: ArrayBuffer
  regular: ArrayBuffer
  bold: ArrayBuffer
  signature?: ArrayBuffer
  stamp?: ArrayBuffer
}

interface EmMetrics {
  ascentEm: number
  descentEm: number
}

function emMetrics(bytes: ArrayBuffer): EmMetrics {
  const f = fontkit.create(new Uint8Array(bytes))
  return { ascentEm: f.ascent / f.unitsPerEm, descentEm: Math.abs(f.descent) / f.unitsPerEm }
}

/**
 * The CSS box top → the first line's text baseline (what pdf-lib's drawText
 * expects). For a block with `line-height` L, font ascent A and descent D:
 * baseline = top + (L − (A+D))/2 + A.
 */
function baselineFromTop(top: number, fontSize: number, m: EmMetrics): number {
  const lineH = FIELD_LINE_HEIGHT * fontSize
  const a = m.ascentEm * fontSize
  const d = m.descentEm * fontSize
  return top + (lineH - (a + d)) / 2 + a
}

/** Character wrap (Thai has no word spaces) to a max width in points. */
function wrapChars(text: string, font: PDFFont, sizePt: number, maxW: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    const trial = cur + ch
    if (cur && font.widthOfTextAtSize(trial, sizePt) > maxW) {
      lines.push(cur)
      cur = ch === ' ' ? '' : ch
    } else {
      cur = trial
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/** One WHT certificate as a single-page A4 PDF. */
export async function buildWhtPdfBytes(
  record: WhtRecordWithVendor,
  profile: WhtProfile,
  seq: number,
  assets: WhtPdfAssets,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const regular = await doc.embedFont(new Uint8Array(assets.regular), { subset: true })
  const bold = await doc.embedFont(new Uint8Array(assets.bold), { subset: true })
  const regM = emMetrics(assets.regular)
  const boldM = emMetrics(assets.bold)

  const page = doc.addPage([A4_W, A4_H])
  const bg = await doc.embedPng(assets.formPng)
  page.drawImage(bg, { x: 0, y: 0, width: A4_W, height: A4_H })

  for (const f of buildFields(record, profile, seq)) {
    const font = f.bold ? bold : regular
    const m = f.bold ? boldM : regM
    const sizePt = f.fontSize * SX
    const base = baselineFromTop(f.top, f.fontSize, m)
    const lineH = FIELD_LINE_HEIGHT * f.fontSize
    const maxW = (f.width ?? PAGE_W) * SX
    const lines = f.wrap ? wrapChars(f.value, font, sizePt, maxW) : [f.value]
    lines.forEach((ln, li) => {
      const y = A4_H - (base + li * lineH) * SY
      const x = f.rightAlign
        ? (f.left + (f.width ?? 0)) * SX - font.widthOfTextAtSize(ln, sizePt)
        : f.left * SX
      page.drawText(ln, { x, y, size: sizePt, font, color: rgb(0, 0, 0) })
    })
  }

  // Form-type checkmark (two strokes approximating the SVG path, y-flipped).
  const pos = CHECKMARK_POS[record.formType]
  if (pos) {
    const top = cssTop(pos.top, pos.fs)
    const at = (px: number, py: number) => ({
      x: (pos.left + (px / 32) * pos.fs) * SX,
      y: A4_H - (top + (py / 32) * pos.fs) * SY,
    })
    const thickness = (2.2 / 32) * pos.fs * SX
    page.drawLine({ start: at(6, 17), end: at(13, 25), thickness, color: rgb(0, 0, 0) })
    page.drawLine({ start: at(13, 25), end: at(27, 7), thickness, color: rgb(0, 0, 0) })
  }

  if (assets.signature) {
    const img = await doc.embedPng(assets.signature)
    page.drawImage(img, {
      x: SIGNATURE_LEFT * SX,
      y: A4_H - (SIGNATURE_TOP + SIGNATURE_H) * SY,
      width: SIGNATURE_W * SX,
      height: SIGNATURE_H * SY,
    })
  }
  if (assets.stamp) {
    const img = await doc.embedPng(assets.stamp)
    page.drawImage(img, {
      x: STAMP_LEFT * SX,
      y: A4_H - (STAMP_TOP + STAMP_SIZE) * SY,
      width: STAMP_SIZE * SX,
      height: STAMP_SIZE * SY,
      opacity: 0.85,
    })
  }

  return doc.save()
}

// Half-size copy of the form (1512×2138) for embedding: the preview keeps the
// 2× asset for retina, but a batch export embeds this image in every PDF, so the
// smaller one keeps the zip reasonable (~0.8 MB per certificate vs ~2.3 MB).
const BG_IMAGE_PDF = '/wht/form_page_pdf.png'

/** Load the form + font bytes once, so a batch export does not re-fetch them. */
export async function loadWhtBaseAssets(): Promise<Omit<WhtPdfAssets, 'signature' | 'stamp'>> {
  const [formPng, regular, bold] = await Promise.all([
    fetch(BG_IMAGE_PDF).then((r) => r.arrayBuffer()),
    fetch('/fonts/CordiaNew-Regular.ttf').then((r) => r.arrayBuffer()),
    fetch('/fonts/CordiaNew-Bold.ttf').then((r) => r.arrayBuffer()),
  ])
  return { formPng, regular, bold }
}

/** Fetch presigned image bytes (returns undefined when absent/unreadable). */
export async function fetchPngBytes(url: string | null | undefined): Promise<ArrayBuffer | undefined> {
  if (!url) return undefined
  try {
    const r = await fetch(url)
    if (!r.ok) return undefined
    return await r.arrayBuffer()
  } catch {
    return undefined
  }
}
