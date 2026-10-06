import { PDFDocument, PDFFont, PDFPage, RGB, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import qrcode from 'qrcode-generator'
import { createHash } from 'node:crypto'
import { readFileSync as readFs } from 'node:fs'
import { join } from 'node:path'
import { normalizeLineItem } from '../../src/lib/line-items'
import { vendorDisplayName } from '../../src/lib/vendor-name'

// Server-side A4 receipt PDF. Embedded Sarabun (SIL OFL) + QR verification.
//
// Layout: header → parties → optional note → item table → totals → signature
// pinned to the bottom of the last page. The item table paginates automatically;
// on overflow the header row repeats and the page chrome stays consistent.
//
// [VERIFY] Thai shaping caveat: pdf-lib embeds glyphs without full OpenType
// mark positioning, so stacked vowels/tone marks can sit slightly off compared
// to browser rendering. The accountant must eyeball the first real PDF; the
// browser print path (ReceiptView + print CSS) remains the trusted fallback.

export interface ReceiptLine {
  description: string
  unit?: string
  quantity?: number
  unitPrice?: number
  discount?: number
  amount: number
}

export interface ReceiptPdfInput {
  number: string
  issueDate: string // ISO date — the document date (payment date)
  /** The real issuance datetime; shown as the "issued on" remark. */
  issuedAt?: string // ISO datetime
  verifyUrl: string // encoded in QR
  verificationCode: string
  verificationMethod: string
  consentVersion: string
  signedAt: string // ISO datetime
  client: { code: string; display: string } // display = name/addr/taxid line [VERIFY]
  vendor: { prefix: string; name: string; address: string; maskedId: string; phone?: string; email?: string }
  // Line items are the source; a legacy single line is expressed as one item.
  lineItems: ReceiptLine[]
  note?: string
  description?: string // legacy fallback when lineItems is empty
  grossAmount: number
  whtRate: number
  whtAmount: number
  netAmount: number
  amountWords: string // precomputed via amountToThaiWords (shared rule)
  transferDate: string
  slipReference: string
  signaturePng?: Uint8Array // vendor signature; representative signs on paper
  // Vendor-facing receipts omit the verification block. Set true only for the
  // internal/audit copy (kept for officers, not printed for the vendor).
  showVerification?: boolean
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

const INK = rgb(0.102, 0.137, 0.196)
const MUTED = rgb(0.392, 0.451, 0.549)
const FAINT = rgb(0.62, 0.671, 0.741)
const ACCENT = rgb(0.059, 0.463, 0.431)
const PANEL = rgb(0.965, 0.973, 0.98)
const RULE = rgb(0.886, 0.91, 0.941)
const ZEBRA = rgb(0.98, 0.984, 0.99)

// How the vendor's signature was captured (stored on the authorization).
const METHOD_TH: Record<string, string> = {
  'stub-deferred': 'ลายเซ็น (วาดด้วยนิ้ว/เมาส์)',
  'typed-consent': 'พิมพ์ชื่อเพื่อลงนาม',
  'uploaded-signature': 'ลายเซ็นจากไฟล์ที่อัปโหลด',
  'line-liff': 'ยืนยันด้วย LINE',
}

const A4 = { w: 595.28, h: 841.89 }
const M = 48
const GUTTER = 14
const ITEMS_LIMIT = M + 40 // item rows may run lower (only page number sits below)
const BOTTOM_LIMIT = M + 92 // keep room here for totals + bottom signature
const SIG_Y = M + 48

function fontsDir(): string {
  // Bundlers (Vercel) rewrite import.meta.url, so resolve from the project root
  // instead. `includeFiles` in vercel.json ships server/assets/fonts to the
  // function's working directory. FONTS_DIR overrides for other layouts.
  return process.env.FONTS_DIR ?? join(process.cwd(), 'server', 'assets', 'fonts')
}

async function loadDoc(): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const dir = fontsDir()
  const regular = await doc.embedFont(readFs(join(dir, 'Sarabun-Regular.ttf')))
  const bold = await doc.embedFont(readFs(join(dir, 'Sarabun-Bold.ttf')))
  return { doc, fonts: { regular, bold } }
}

// Thai has no spaces between words — wrap by characters.
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    const trial = cur + ch
    if (font.widthOfTextAtSize(trial, size) > maxW && cur) {
      lines.push(cur)
      cur = ch === ' ' ? '' : ch
    } else {
      cur = trial
    }
  }
  if (cur) lines.push(cur)
  return lines
}

const thb = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Draw the verification QR as filled modules (vector) instead of embedding a
// PNG. Avoids the `qrcode` server build, which pulls pngjs/node:fs and breaks
// the Vercel ESM function bundle (FUNCTION_INVOCATION_FAILED) at import time.
function drawQr(page: PDFPage, data: string, x: number, y: number, size: number, color: RGB): void {
  const qr = qrcode(0, 'M')
  qr.addData(data)
  qr.make()
  const count = qr.getModuleCount()
  const cell = size / count
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        page.drawRectangle({ x: x + c * cell, y: y + (count - 1 - r) * cell, width: cell, height: cell, color })
      }
    }
  }
}

function normalizeItems(input: ReceiptPdfInput): ReceiptLine[] {
  const items = (input.lineItems ?? [])
    .map((it) => normalizeLineItem(it))
    .filter((it) => it.description || it.amount > 0)
  if (items.length > 0) return items
  return [normalizeLineItem({ description: input.description ?? 'รายการ', amount: Number(input.grossAmount) || 0 })]
}

export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<{ bytes: Uint8Array; sha256: string }> {
  const { doc, fonts } = await loadDoc()
  const { regular, bold } = fonts
  const maxW = A4.w - M * 2
  const right = M + maxW

  const pages: PDFPage[] = []
  let page!: PDFPage

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont = regular, color = INK) =>
    page.drawText(t, { x, y: yy, size, font, color })
  const rightText = (t: string, xEnd: number, yy: number, size: number, font: PDFFont = regular, color = INK) =>
    text(t, xEnd - font.widthOfTextAtSize(t, size), yy, size, font, color)
  const rule = (yy: number, color = RULE, thickness = 1) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: right, y: yy }, thickness, color })
  const label = (t: string, x: number, yy: number) => text(t, x, yy, 8.5, bold, FAINT)
  const accent = () => page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: ACCENT })

  let y = 0
  const newPage = (continuation: boolean) => {
    page = doc.addPage([A4.w, A4.h])
    pages.push(page)
    accent()
    y = A4.h - 62
    if (continuation) {
      text('ใบเสร็จรับเงิน', M, y, 13, bold, INK)
      rightText(`เลขที่ ${input.number}`, right, y, 10, regular, MUTED)
      y -= 14
      rule(y, RULE, 1)
      y -= 26
    }
  }

  // ── Header: vendor (left) · document type (right) ──
  newPage(false)
  const halfW = maxW / 2 - 16
  text(vendorDisplayName(input.vendor.prefix, input.vendor.name), M, y, 14, bold, INK)
  const vAddr = wrap(`ที่อยู่: ${input.vendor.address}`, regular, 10, halfW)
  vAddr.slice(0, 2).forEach((ln, i) => text(ln, M, y - 16 - i * 13, 10, regular, MUTED))
  const idY = y - 16 - Math.min(vAddr.length, 2) * 13
  text(`เลขบัตรประชาชน: ${input.vendor.maskedId}`, M, idY, 9.5, regular, MUTED)
  // Contact lines, only when the vendor supplied them at signing.
  let contactY = idY - 12
  if (input.vendor.phone) {
    text(`โทร: ${input.vendor.phone}`, M, contactY, 9, regular, MUTED)
    contactY -= 12
  }
  if (input.vendor.email) {
    text(`อีเมล: ${input.vendor.email}`, M, contactY, 9, regular, MUTED)
  }
  rightText('ใบเสร็จรับเงิน', right, y, 24, bold, INK)
  rightText('RECEIPT', right, y - 18, 9, regular, FAINT)
  rightText('ต้นฉบับ', right, y - 30, 9, bold, MUTED)
  // Labels and values left-aligned to shared edges (labels start at the same x).
  const infoLabelX = right - 180
  const infoValueX = right - 128
  text('เลขที่:', infoLabelX, y - 48, 10.5, bold, INK)
  text(input.number, infoValueX, y - 48, 10.5, bold, INK)
  text('วันที่:', infoLabelX, y - 64, 10, regular, MUTED)
  text(input.issueDate, infoValueX, y - 64, 10, regular, MUTED)
  y -= 78
  rule(y, INK, 1.5)
  y -= 30

  // ── Client box (full width) ──
  const boxH = 90
  page.drawRectangle({ x: M, y: y - boxH, width: maxW, height: boxH, color: PANEL })
  const lx = M + 12
  label('ผู้ซื้อ (ลูกค้า)', lx, y - 20)
  const cName = wrap(input.client.display, regular, 11, maxW - 24)
  cName.slice(0, 2).forEach((ln, i) => text(ln, lx, y - 38 - i * 14, 11, bold, INK))
  y -= boxH + 26

  // ── Optional note ──
  const note = (input.note ?? '').trim()
  if (note) {
    for (const line of wrap(note, regular, 10.5, maxW)) {
      text(line, M, y, 10.5, regular, MUTED)
      y -= 15
    }
    y -= 8
  }

  // ── Items table ──
  const numW = 20
  const descX = M + numW + 8
  // Right-anchored columns: amount | discount | unit price | unit | qty | description
  const amtW = 82
  const discW = 74
  const priceW = 84
  const unitW = 52
  const qtyW = 34
  const amtRight = right
  const discRight = right - amtW - 6
  const priceRight = discRight - discW - 6
  const unitRight = priceRight - priceW - 8
  const qtyRight = unitRight - unitW - 6
  const descW = qtyRight - qtyW - 10 - descX

  const itemsHeader = () => {
    label('#', M, y)
    label('รายละเอียด', descX, y)
    rightText('จำนวน', qtyRight, y, 8.5, bold, FAINT)
    rightText('หน่วย', unitRight, y, 8.5, bold, FAINT)
    rightText('ราคา/หน่วย', priceRight, y, 8.5, bold, FAINT)
    rightText('ส่วนลด', discRight, y, 8.5, bold, FAINT)
    rightText('จำนวนเงิน', amtRight, y, 8.5, bold, FAINT)
    y -= 8
    rule(y, INK, 1)
    y -= 18
  }
  itemsHeader()

  const items = normalizeItems(input)
  items.forEach((it, i) => {
    const lines = wrap(it.description || '—', regular, 10.5, descW)
    const rowH = Math.max(20, lines.length * 14 + 6)
    if (y - rowH < ITEMS_LIMIT) {
      newPage(true)
      itemsHeader()
    }
    if (i % 2 === 1) page.drawRectangle({ x: M - 6, y: y - rowH + 4, width: maxW + 12, height: rowH - 4, color: ZEBRA })
    text(String(i + 1), M + numW - regular.widthOfTextAtSize(String(i + 1), 10.5), y - 10, 10.5, regular, MUTED)
    lines.forEach((ln, li) => text(ln, descX, y - 10 - li * 14, 10.5, regular, INK))
    rightText(`${it.quantity ?? 1}`, qtyRight, y - 10, 10.5, regular, INK)
    rightText(`${it.unit || 'รายการ'}`, unitRight, y - 10, 10.5, regular, INK)
    rightText(`${thb(it.unitPrice ?? it.amount)}`, priceRight, y - 10, 10.5, regular, INK)
    rightText(it.discount ? `${thb(it.discount)}` : '—', discRight, y - 10, 10.5, regular, MUTED)
    rightText(`${thb(it.amount)}`, amtRight, y - 10, 10.5, bold, INK)
    y -= rowH
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: RULE })
  })
  y -= 14

  // ── Totals (keep together with signature space) ──
  const totalsH = 118
  if (y - totalsH < BOTTOM_LIMIT) newPage(true)

  const totalRow = (labelText: string, value: string, opts?: { strong?: boolean }) => {
    text(labelText, M, y, opts?.strong ? 11.5 : 11, opts?.strong ? bold : regular, opts?.strong ? INK : MUTED)
    rightText(value, right, y, opts?.strong ? 11.5 : 11, opts?.strong ? bold : regular, opts?.strong ? INK : MUTED)
    y -= 22
  }
  totalRow('รวมเป็นเงิน', `${thb(input.grossAmount)}`)
  if (input.whtRate > 0) totalRow(`หักภาษี ณ ที่จ่าย ${input.whtRate}%`, `- ${thb(input.whtAmount)}`)
  rule(y + 8, INK, 1.5)
  y -= 8
  text('ยอดรับสุทธิ', M, y, 12, bold, INK)
  rightText(`${thb(input.netAmount)}`, right, y - 3, 18, bold, INK)
  y -= 22
  text(`(${input.amountWords})`, M, y, 9.5, regular, MUTED)
  y -= 14
  // The document date is the payment date; state the real issuance date here.
  text(`เอกสารฉบับนี้ออกเมื่อ ${String(input.issuedAt ?? input.issueDate).slice(0, 10)}`, M, y, 9, regular, FAINT)

  // ── Signature, centered above the bottom margin ──
  const sigY = input.showVerification ? SIG_Y + 60 : SIG_Y
  const sigW = 220
  const sigX = (A4.w - sigW) / 2
  const centerText = (t: string, yy: number, size: number, font: PDFFont, color: typeof INK) =>
    text(t, A4.w / 2 - font.widthOfTextAtSize(t, size) / 2, yy, size, font, color)
  if (input.signaturePng) {
    try {
      const img = await doc.embedPng(input.signaturePng)
      const scale = Math.min(150 / img.width, 54 / img.height)
      const w = img.width * scale
      page.drawImage(img, { x: A4.w / 2 - w / 2, y: sigY + 6, width: w, height: img.height * scale })
    } catch {
      /* corrupt upload must not break issuance — reviewer checks the file */
    }
  }
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 1, color: FAINT })
  centerText('ผู้มีอำนาจลงนาม', sigY - 14, 9.5, bold, INK)
  centerText(vendorDisplayName(input.vendor.prefix, input.vendor.name), sigY - 28, 9, regular, MUTED)
  // The signing record (time + how it was signed) — the non-repudiation line.
  centerText(
    `ลงนามเมื่อ ${String(input.signedAt).slice(0, 10)} · ${METHOD_TH[input.verificationMethod] ?? 'ลายเซ็น'}`,
    sigY - 40,
    8.5,
    regular,
    FAINT,
  )

  // ── Verification footer (audit copy only) ──
  if (input.showVerification) {
    const qrSize = 64
    drawQr(page, input.verifyUrl, right - qrSize, M - 6, qrSize, INK)
    text(`รหัสตรวจสอบ  ${input.verificationCode}`, M, M + 30, 9.5, bold, INK)
    text(input.verifyUrl, M, M + 14, 8.5, regular, MUTED)
  }

  // ── Page numbers ──
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `หน้า ${i + 1} / ${pages.length}`
      p.drawText(t, { x: A4.w / 2 - regular.widthOfTextAtSize(t, 8.5) / 2, y: M - 30, size: 8.5, font: regular, color: FAINT })
    })
  }

  const bytes = await doc.save()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { bytes, sha256 }
}
