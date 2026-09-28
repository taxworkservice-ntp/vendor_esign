import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { createHash } from 'node:crypto'
import { readFileSync as readFs } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Server-side A4 receipt PDF. Embedded Sarabun (SIL OFL) + QR verification.
//
// [VERIFY] Thai shaping caveat: pdf-lib embeds glyphs without full OpenType
// mark positioning, so stacked vowels/tone marks can sit slightly off compared
// to browser rendering. The accountant must eyeball the first real PDF; the
// browser print path (ReceiptView + print CSS) remains the trusted fallback.

export interface ReceiptPdfInput {
  number: string
  issueDate: string // ISO date
  verifyUrl: string // encoded in QR
  verificationCode: string
  verificationMethod: string
  consentVersion: string
  signedAt: string // ISO datetime
  client: { code: string; display: string } // display = name/addr/taxid line [VERIFY]
  vendor: { name: string; address: string; maskedId: string }
  description: string
  grossAmount: number
  whtRate: number
  whtAmount: number
  netAmount: number
  amountWords: string // precomputed via amountToThaiWords (shared rule)
  transferDate: string
  slipReference: string
  signaturePng?: Uint8Array // vendor signature; representative signs on paper
}

const INK = rgb(0.1, 0.14, 0.2)
const MUTED = rgb(0.39, 0.45, 0.55)
const A4 = { w: 595.28, h: 841.89 }
const M = 48

function fontsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts')
}

async function loadDoc(): Promise<{ doc: PDFDocument; regular: PDFFont; bold: PDFFont }> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const dir = fontsDir()
  const regular = await doc.embedFont(readFs(join(dir, 'Sarabun-Regular.ttf')))
  const bold = await doc.embedFont(readFs(join(dir, 'Sarabun-Bold.ttf')))
  return { doc, regular, bold }
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

export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<{ bytes: Uint8Array; sha256: string }> {
  const { doc, regular, bold } = await loadDoc()
  const page: PDFPage = doc.addPage([A4.w, A4.h])
  const maxW = A4.w - M * 2
  let y = A4.h - 56

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont = regular, color = INK) =>
    page.drawText(t, { x, y: yy, size, font, color })

  // Title block
  page.drawText('ใบเสร็จรับเงิน', { x: M, y, size: 24, font: bold, color: INK })
  y -= 20
  text(`เลขที่ ${input.number}  ·  วันที่ ${input.issueDate}`, M, y, 11, regular, MUTED)
  y -= 30

  // Seller / buyer blocks
  const boxH = 86
  page.drawRectangle({ x: M, y: y - boxH, width: (maxW - 12) / 2, height: boxH, borderColor: MUTED, borderWidth: 1 })
  page.drawRectangle({ x: M + (maxW + 12) / 2, y: y - boxH, width: (maxW - 12) / 2, height: boxH, borderColor: MUTED, borderWidth: 1 })
  const colW = (maxW - 12) / 2 - 16
  text('ผู้ขาย (ผู้รับเงิน)', M + 8, y - 18, 11, bold)
  for (const [i, line] of wrap(`${input.vendor.name}  ${input.vendor.address}  เลขบัตร: ${input.vendor.maskedId}`, regular, 10, colW).slice(0, 3).entries())
    text(line, M + 8, y - 34 - i * 14, 10)
  const bx = M + (maxW + 12) / 2
  text('ผู้ซื้อ (ลูกค้า)', bx + 8, y - 18, 11, bold)
  for (const [i, line] of wrap(input.client.display, regular, 10, colW).slice(0, 3).entries())
    text(line, bx + 8, y - 34 - i * 14, 10)
  y -= boxH + 24

  // Amount table
  const row = (label: string, value: string, isBold = false, sub?: string) => {
    text(label, M, y, 11, isBold ? bold : regular)
    const f = isBold ? bold : regular
    const w = f.widthOfTextAtSize(value, 11)
    text(value, M + maxW - w, y, 11, f)
    y -= sub ? 15 : 20
    if (sub) {
      text(sub, M, y, 10, regular, MUTED)
      y -= 20
    }
  }
  for (const line of wrap(input.description, regular, 11, maxW - 150)) {
    text(line, M, y, 11)
    y -= 18
  }
  text(`โอน ${input.transferDate} · อ้างอิง ${input.slipReference}`, M, y, 10, regular, MUTED)
  y -= 26
  row('ยอด gross', `฿${thb(input.grossAmount)}`)
  if (input.whtRate > 0) row(`หักภาษี ณ ที่จ่าย ${input.whtRate}%`, `฿${thb(input.whtAmount)}`)
  row('ยอดรับสุทธิ', `฿${thb(input.netAmount)}`, true, `(${input.amountWords})`)
  y -= 6

  // Legal statements
  for (const line of wrap('ผู้ขายมิได้จดทะเบียนภาษีมูลค่าเพิ่ม — เอกสารนี้เป็นใบเสร็จรับเงินเท่านั้น ไม่ใช่ใบกำกับภาษี · ออกโดยผู้แทนลูกค้าในนามและโดยได้รับมอบอำนาจจากผู้ขายเฉพาะธุรกรรมนี้', regular, 10, maxW)) {
    text(line, M, y, 10, regular, MUTED)
    y -= 15
  }
  y -= 14

  // Signatures
  const sigY = y - 64
  if (input.signaturePng) {
    try {
      const img = await doc.embedPng(input.signaturePng)
      const scale = Math.min(150 / img.width, 52 / img.height)
      page.drawImage(img, { x: M, y: sigY, width: img.width * scale, height: img.height * scale })
    } catch {
      /* corrupt upload must not break issuance — reviewer checks the file */
    }
  }
  text('ลายเซ็นผู้ขาย', M, sigY - 14, 10)
  text(input.vendor.name, M, sigY - 28, 10, regular, MUTED)
  const rx = M + maxW / 2
  text('ลายเซ็นผู้แทน (เซ็นบนกระดาษหลังพิมพ์)', rx, sigY - 14, 10)
  y = sigY - 52

  // Verification footer + QR
  page.drawLine({ start: { x: M, y }, end: { x: M + maxW, y }, thickness: 1, color: MUTED })
  y -= 18
  const qrPng = await QRCode.toBuffer(input.verifyUrl, { width: 160, margin: 1 })
  const qr = await doc.embedPng(qrPng)
  page.drawImage(qr, { x: M + maxW - 84, y: y - 84, width: 84, height: 84 })
  text(`ยืนยัน: ${input.signedAt} · วิธี: ${input.verificationMethod} · consent ${input.consentVersion}`, M, y, 9, regular, MUTED)
  text(`รหัสตรวจสอบ: ${input.verificationCode}`, M, y - 15, 10, bold)
  text(input.verifyUrl, M, y - 30, 9, regular, MUTED)

  const bytes = await doc.save()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { bytes, sha256 }
}
