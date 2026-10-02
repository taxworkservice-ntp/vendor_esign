import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { fetchWhtByIds, fetchWhtByScope } from '../lib/wht-source'
import { signDownload } from '../lib/r2-assets'
import { downloadName } from '../lib/download-name'
import { useClientAuth } from '../lib/client-auth'
import { loadSettings } from '../lib/settings'
import {
  fmtWhtDate,
  fmtWhtNum,
  splitTaxId,
  thaiBahtText,
  type WhtFormType,
  type WhtRecordWithVendor,
} from '../lib/wht'
import { Button } from '../components/ui/button'

// Pixel-exact port of invoice-system's WHT print template
// (src/app/(client)/wht/print.tsx): a 1512×2138 Revenue-Department form image
// with absolutely-positioned fields, plus a clean A4 layout. Assets live in
// public/wht/form_page_final.png and public/fonts (Cordia New/Sarabun/Noto).

const PAGE_W = 1512
const PAGE_H = 2138
const BG_IMAGE = '/wht/form_page_final.png'
const FONT_FAMILY = "'Cordia New', 'Sarabun', 'Noto Sans Thai', sans-serif"

interface FieldDef {
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

const CHECKMARK_POS: Record<WhtFormType, { top: number; left: number; fs: number }> = {
  pnd1: { top: 605, left: 535, fs: 32 },
  pnd1_special: { top: 605, left: 733, fs: 32 },
  pnd2: { top: 605, left: 1007, fs: 32 },
  pnd3: { top: 605, left: 1203, fs: 32 },
  pnd2a: { top: 657, left: 535, fs: 32 },
  pnd3a: { top: 657, left: 733, fs: 32 },
  pnd53: { top: 655, left: 1005, fs: 32 },
}

const FIELD_TOP_OFFSET = 3
const cssTop = (configTop: number, fs: number) => configTop - fs + FIELD_TOP_OFFSET

interface WhtProfile {
  company_name_th: string
  tax_id: string
  address: string
  clientCode?: string
  signatureStoragePath?: string
  stampStoragePath?: string
}

// Signature sits above the sign-date, stamp to its left — both can overlap.
// date_bottom is at CSS top ~1913; signature bottom ~20px above that.
const SIGNATURE_TOP = 1893
const SIGNATURE_LEFT = 964
const SIGNATURE_W = 186
const SIGNATURE_H = 70
const STAMP_TOP = 1893
const STAMP_LEFT = 815
const STAMP_SIZE = 139

function buildFields(record: WhtRecordWithVendor, profile: WhtProfile, seq: number): FieldDef[] {
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
    { name: 'payer_taxid', top: cssTop(241, 45), left: 961, fontSize: 45, bold: true, value: splitTaxId(profile.tax_id) },
    { name: 'payer_address', top: cssTop(337, 31), left: 166, fontSize: 31, wrap: true, width: 1166, value: profile.address || '' },
    { name: 'name', top: cssTop(464, 32), left: 169, fontSize: 32, width: 583, value: String(v.vendorName || '') },
    { name: 'taxid', top: cssTop(416, 45), left: 961, fontSize: 45, bold: true, value: splitTaxId(v.vendorTaxId) },
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

function PndPage({
  record,
  profile,
  seq,
  signatureUrl,
  stampUrl,
}: {
  record: WhtRecordWithVendor
  profile: WhtProfile
  seq: number
  signatureUrl?: string
  stampUrl?: string
}) {
  const fields = buildFields(record, profile, seq)
  const check = CHECKMARK_POS[record.formType]
  return (
    <div className="print-sheet" style={{ width: PAGE_W + 'px', height: PAGE_H + 'px', position: 'relative', overflow: 'hidden', fontFamily: FONT_FAMILY }}>
      <img alt="form" src={BG_IMAGE} style={{ position: 'absolute', inset: 0, width: PAGE_W + 'px', height: PAGE_H + 'px' }} />
      {check && (
        <svg
          aria-label={record.formType}
          style={{ position: 'absolute', top: cssTop(check.top, check.fs) + 'px', left: check.left + 'px', width: check.fs + 'px', height: check.fs + 'px' }}
          viewBox="0 0 32 32"
          fill="none"
          stroke="#000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 6 17 C 6 17, 10 23, 13 25 C 16 19, 22 12, 27 7" />
        </svg>
      )}
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: f.top + 'px',
            left: f.left + 'px',
            fontSize: f.fontSize + 'px',
            fontWeight: f.bold ? 700 : 400,
            lineHeight: 1.35,
            whiteSpace: f.wrap ? 'normal' : 'pre',
            wordBreak: f.wrap ? 'break-word' : 'normal',
            color: '#000',
            ...(f.width ? { width: f.width + 'px' } : {}),
            ...(f.rightAlign ? { textAlign: 'right' } : {}),
          }}
        >
          {f.value}
        </div>
      ))}
      {stampUrl && (
        <img
          src={stampUrl}
          alt=""
          style={{
            position: 'absolute',
            top: STAMP_TOP + 'px',
            left: STAMP_LEFT + 'px',
            width: STAMP_SIZE + 'px',
            height: STAMP_SIZE + 'px',
            objectFit: 'contain',
            opacity: 0.85,
          }}
        />
      )}
      {signatureUrl && (
        <img
          src={signatureUrl}
          alt=""
          style={{
            position: 'absolute',
            top: SIGNATURE_TOP + 'px',
            left: SIGNATURE_LEFT + 'px',
            width: SIGNATURE_W + 'px',
            height: SIGNATURE_H + 'px',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  )
}

function CleanPage({ record, profile }: { record: WhtRecordWithVendor; profile: WhtProfile }) {
  return (
    <div
      className="print-sheet"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '10mm',
        boxSizing: 'border-box',
        fontFamily: "'Cordia New', 'Sarabun', sans-serif",
        backgroundColor: '#fff',
        position: 'relative',
      }}
    >
      <div style={{ marginBottom: '6mm' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, textAlign: 'center', marginBottom: '2mm' }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
        <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '4mm' }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3mm' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '1mm' }}>ผู้จ่ายเงิน</div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{profile.company_name_th || '-'}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>เลขที่ผู้เสียภาษี: {splitTaxId(profile.tax_id)}</div>
            <div style={{ fontSize: '10px', color: '#666' }}>{profile.address || ''}</div>
          </div>
          <div style={{ width: '40mm', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '1mm' }}>เลขที่ใบรับรอง</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#378ADD' }}>{record.certificateNo || '-'}</div>
            <div style={{ display: 'inline-block', marginTop: '2mm', padding: '1mm 3mm', borderRadius: '2mm', backgroundColor: '#EEF2FF', color: '#4338CA', fontSize: '10px', fontWeight: 600 }}>
              {record.formType.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: '4mm' }} />
      <div style={{ marginBottom: '3mm' }}>
        <div style={{ fontSize: '10px', color: '#666', marginBottom: '1mm' }}>ผู้ถูกหักภาษี ณ ที่จ่าย</div>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{record.vendorName || '-'}</div>
        <div style={{ fontSize: '10px', color: '#666' }}>เลขที่ผู้เสียภาษี: {splitTaxId(record.vendorTaxId)}</div>
        <div style={{ fontSize: '10px', color: '#666' }}>{record.vendorAddress || ''}</div>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: '4mm' }} />
      <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#F7F6F3' }}>
            <th style={{ padding: '1.5mm 3mm', textAlign: 'left', fontSize: '10px', color: '#666', fontWeight: 500 }}>วันที่จ่าย</th>
            <th style={{ padding: '1.5mm 3mm', textAlign: 'right', fontSize: '10px', color: '#666', fontWeight: 500 }}>จำนวนเงิน</th>
            <th style={{ padding: '1.5mm 3mm', textAlign: 'center', fontSize: '10px', color: '#666', fontWeight: 500 }}>อัตรา</th>
            <th style={{ padding: '1.5mm 3mm', textAlign: 'right', fontSize: '10px', color: '#666', fontWeight: 500 }}>ภาษีหัก</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '2mm 3mm' }}>{fmtWhtDate(record.issueDate)}</td>
            <td style={{ padding: '2mm 3mm', textAlign: 'right' }}>{fmtWhtNum(record.amount)}</td>
            <td style={{ padding: '2mm 3mm', textAlign: 'center' }}>{record.whtRate}%</td>
            <td style={{ padding: '2mm 3mm', textAlign: 'right', color: '#C0392B', fontWeight: 600 }}>{fmtWhtNum(record.whtAmount)}</td>
          </tr>
          <tr style={{ borderTop: '1px solid #E8E6DF' }}>
            <td colSpan={4} style={{ padding: '2mm 3mm' }}>
              <span style={{ fontSize: '10px', color: '#666' }}>จำนวนเงินที่หัก (ตัวอักษร): </span>
              <span style={{ fontSize: '11px' }}>{thaiBahtText(record.whtAmount)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      {record.note && <div style={{ marginTop: '3mm', fontSize: '9px', color: '#888', fontStyle: 'italic' }}>หมายเหตุ: {record.note}</div>}
      <div style={{ marginTop: '8mm', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#666', marginTop: '1mm' }}>___________________________</div>
          <div style={{ fontSize: '11px' }}>{profile.company_name_th || 'ผู้จ่ายเงิน'}</div>
          <div style={{ fontSize: '9px', color: '#888' }}>ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม</div>
          <div style={{ fontSize: '10px', color: '#666' }}>วันที่ .......... / .......... / ..........</div>
        </div>
      </div>
    </div>
  )
}

export function WhtPrint() {
  const [params] = useSearchParams()
  const ids = useMemo(() => (params.get('ids') || '').split(',').filter(Boolean), [params])
  // Scope mode: month + form + status, the same filters the list shows. This is
  // what "print everything for this month" uses. The old link put every record
  // id in the URL, which silently broke past ~54 certificates once the string
  // passed the browser's ~2000-character limit.
  const scope = useMemo(() => {
    const p = new URLSearchParams(params)
    p.delete('ids')
    p.delete('layout')
    p.delete('page')
    p.delete('size')
    return p
  }, [params])
  const byScope = ids.length === 0
  const layout = params.get('layout') || 'pnd'
  const [records, setRecords] = useState<WhtRecordWithVendor[]>([])
  const [profile, setProfile] = useState<WhtProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [stampUrl, setStampUrl] = useState<string | null>(null)

  const { activeTenant } = useClientAuth()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    void (async () => {
      try {
        const res = byScope
          ? { records: await fetchWhtByScope(activeTenant, scope), tenantId: activeTenant }
          : await fetchWhtByIds(ids)
        if (cancelled) return
        setRecords(res.records)
        const tenantId = res.tenantId ?? activeTenant
        if (records.length === 0 && res.records.length === 0) {
          setErr('ไม่พบหนังสือรับรองตามเงื่อนไขที่เลือก')
        }
        const s = loadSettings(tenantId)
        setProfile({
          company_name_th: s.displayName,
          tax_id: s.taxId,
          address: s.address,
          clientCode: s.clientCode,
          signatureStoragePath: s.signatureStoragePath,
          stampStoragePath: s.stampStoragePath,
        })
      } catch {
        if (!cancelled) setErr('โหลดหนังสือรับรองไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ids, byScope, scope, activeTenant])

  // Resolve presigned download URLs for the signature/stamp whenever their
  // storage paths change. Short-lived URLs are fine — the page renders once.
  useEffect(() => {
    if (!profile) {
      setSignatureUrl(null)
      setStampUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      const [sig, stamp] = await Promise.all([
        profile.signatureStoragePath ? signDownload(profile.signatureStoragePath) : null,
        profile.stampStoragePath ? signDownload(profile.stampStoragePath) : null,
      ])
      if (!cancelled) {
        setSignatureUrl(sig)
        setStampUrl(stamp)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.signatureStoragePath, profile?.stampStoragePath])

  const exportPdf = async () => {
    setErr('')
    setBusy(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.print-sheet'))
      if (!sheets.length) throw new Error('no-sheets')
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
      for (let i = 0; i < sheets.length; i++) {
        const canvas = await html2canvas(sheets[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
        if (i > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
      }
      // Name says what it is, which workspace, and which period — a single
      // certificate is named by its own number, a batch by the scope period.
      const single = records.length === 1 ? records[0].certificateNo : undefined
      pdf.save(
        downloadName({
          kind: 'wht-certificate',
          clientCode: profile?.clientCode,
          period: single ? undefined : scope.get('month') || 'all',
          qualifier: single ?? `${records.length}-docs`,
          ext: 'pdf',
        }),
      )
    } catch {
      setErr('สร้าง PDF ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    // Self-capped: this page used to inherit `max-w-screen-2xl` from the shell's
    // <main>, which was widened to the full viewport. The forms below are a fixed
    // 1512x2138px (Pnd) government layout pinned with absolute coordinates, so the
    // page must stay centred in a bounded column rather than float in whatever
    // space a 4K monitor happens to give it. Restoring the same 1536px ceiling
    // keeps this page pixel-identical to before.
    <div className="mx-auto min-h-screen max-w-screen-2xl bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link to="/wht" className="text-sm font-semibold text-ink-600">← กลับรายการ WHT</Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportPdf} loading={busy}>
            <Download size={15} /> {busy ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> พิมพ์</Button>
        </div>
      </div>
      {err && <p className="no-print px-4 py-3 text-sm font-medium text-danger">{err}</p>}
      {loading && <p className="no-print px-4 py-3 text-sm text-ink-500">กำลังโหลดหนังสือรับรอง…</p>}
      <div className="flex flex-col items-center gap-6 overflow-auto p-6">
        {profile &&
          records.map((r, i) =>
            layout === 'pnd'
              ? <PndPage key={r.id} record={r} profile={profile} seq={i} signatureUrl={signatureUrl ?? undefined} stampUrl={stampUrl ?? undefined} />
              : <CleanPage key={r.id} record={r} profile={profile} />,
          )}
      </div>
    </div>
  )
}
