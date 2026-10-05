import {
  fmtWhtDate,
  fmtWhtNum,
  thaiBahtText,
  type WhtFormType,
  type WhtRecordWithVendor,
} from './wht'

// Placement defaults + type live in settings-types.ts (they are persisted per
// tenant); re-exported here so the preview/PDF import one module.
export {
  DEFAULT_SIGNATURE_PLACEMENT,
  DEFAULT_STAMP_PLACEMENT,
  type Placement,
} from './settings-types'

// The WHT (ใบรับรองการหักภาษี ณ ที่จ่าย) form model — one source of truth for the
// on-screen preview (WhtPrint.tsx). The PDF is a raster of that same DOM
// (sheet-to-a4-pdf.ts), so the download can never drift from what the operator saw.
// See master-prompt-wht-form.md for the full geometry and pipeline.
//
// A 1512×2138 Revenue-Department form image with absolutely-positioned fields.
// Coordinates are in that 1512×2138 space; `top` is the CSS box top for a div
// with `line-height: 1.35`.

export const PAGE_W = 1512
export const PAGE_H = 2138
export const BG_IMAGE = '/wht/form_page_final.png'
export const FONT_FAMILY = "'Cordia New', 'Sarabun', 'Noto Sans Thai', sans-serif"

export const FIELD_LINE_HEIGHT = 1.35

export interface FieldDef {
  name: string
  top: number
  left: number
  fontSize: number
  bold?: boolean
  rightAlign?: boolean
  width?: number
  wrap?: boolean
  value: string
}

export const CHECKMARK_POS: Record<WhtFormType, { top: number; left: number; fs: number }> = {
  pnd1: { top: 605, left: 535, fs: 32 },
  pnd1_special: { top: 605, left: 733, fs: 32 },
  pnd2: { top: 605, left: 1007, fs: 32 },
  pnd3: { top: 605, left: 1203, fs: 32 },
  pnd2a: { top: 657, left: 535, fs: 32 },
  pnd3a: { top: 657, left: 733, fs: 32 },
  pnd53: { top: 655, left: 1005, fs: 32 },
}

const FIELD_TOP_OFFSET = 3
export const cssTop = (configTop: number, fs: number) => configTop - fs + FIELD_TOP_OFFSET

export interface WhtProfile {
  company_name_th: string
  tax_id: string
  address: string
  clientCode?: string
  signatureStoragePath?: string
  stampStoragePath?: string
}

// ── Tax-ID digit boxes ───────────────────────────────────────────────────────
// The form pre-prints 13 digit cells in the Thai standard 1-4-5-2-1 grouping.
// Literal spaces could never hit them (font-dependent), so each digit is centred
// in its printed cell. Geometry measured from public/wht/form_page_final.png in
// the 1512-wide design space: per-group left edge + width (the groups are
// separated by gaps of varying size, so one pitch/gap pair cannot fit all 13).
const TAX_GROUPS = [1, 4, 5, 2, 1]
const TAX_GROUP_LEFT = [951.75, 997.25, 1135.75, 1303.5, 1383.75]
const TAX_GROUP_W = [30, 122, 153.75, 62.25, 30]
// The vendor (ผู้ถูกหักภาษี) row sits ~1px right of the payer row in the scan.
const TAX_VENDOR_DX = 1.25
const TAX_FONT_SIZE = 45
// Digit advance width at TAX_FONT_SIZE in Cordia New Bold (1493/4096 em), used
// to centre the glyph box on the cell centre.
const TAX_DIGIT_ADV = 16.4

function taxIdFields(name: string, configTop: number, value: string | null | undefined, dx = 0): FieldDef[] {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 13)
  const out: FieldDef[] = []
  let i = 0
  TAX_GROUPS.forEach((count, g) => {
    const left = TAX_GROUP_LEFT[g] + dx
    const step = TAX_GROUP_W[g] / count
    for (let k = 0; k < count; k++, i++) {
      out.push({
        name: `${name}-${i}`,
        top: cssTop(configTop, TAX_FONT_SIZE),
        left: Math.round(left + step * (k + 0.5) - TAX_DIGIT_ADV / 2),
        fontSize: TAX_FONT_SIZE,
        bold: true,
        value: digits[i] ?? '',
      })
    }
  })
  return out
}

export function buildFields(record: WhtRecordWithVendor, profile: WhtProfile, seq: number): FieldDef[] {
  const v = record
  const month = record.issueDate ? new Date(record.issueDate).getMonth() + 1 : 1
  const whtId = record.certificateNo || (month ? `${record.issueDate.slice(2, 4)}${String(month).padStart(2, '0')}1${String(seq + 1).padStart(3, '0')}` : '')
  const dateStr = fmtWhtDate(record.issueDate)
  const amtStr = fmtWhtNum(record.amount)
  const whtStr = fmtWhtNum(record.whtAmount)
  const thaiStr = thaiBahtText(record.whtAmount)
  const AMT_W = 260
  const WHT_W = 180

  return [
    { name: 'wht_id', top: cssTop(187, 33), left: 1317, fontSize: 33, value: whtId },
    { name: 'payer_name', top: cssTop(279, 32), left: 165, fontSize: 32, width: 583, value: profile.company_name_th || '' },
    ...taxIdFields('payer_taxid', 241, profile.tax_id),
    { name: 'payer_address', top: cssTop(337, 31), left: 166, fontSize: 31, wrap: true, width: 1166, value: profile.address || '' },
    { name: 'name', top: cssTop(464, 32), left: 169, fontSize: 32, width: 583, value: String(v.vendorName || '') },
    ...taxIdFields('taxid', 416, v.vendorTaxId, TAX_VENDOR_DX),
    { name: 'address', top: cssTop(531, 31), left: 171, fontSize: 31, wrap: true, width: 1166, value: String(v.vendorAddress || '') },
    { name: 'description1', top: cssTop(1624, 33), left: 290, fontSize: 33, width: 480, value: String(record.description || '') },
    { name: 'date1', top: cssTop(1620, 35), left: 857, fontSize: 35, value: dateStr },
    { name: 'amount1', top: cssTop(1620, 35), left: 1175 - AMT_W, fontSize: 35, rightAlign: true, width: AMT_W, value: amtStr },
    { name: 'wht1', top: cssTop(1620, 35), left: 1370 - WHT_W, fontSize: 35, rightAlign: true, width: WHT_W, value: whtStr },
    { name: 'amount2', top: cssTop(1680, 35), left: 1175 - AMT_W, fontSize: 35, rightAlign: true, width: AMT_W, value: amtStr },
    { name: 'wht2', top: cssTop(1680, 35), left: 1370 - WHT_W, fontSize: 35, rightAlign: true, width: WHT_W, value: whtStr },
    { name: 'thai_amount', top: cssTop(1726, 36), left: 503, fontSize: 36, value: thaiStr },
    { name: 'date_bottom', top: cssTop(1945, 35), left: 972, fontSize: 35, value: dateStr },
  ]
}
