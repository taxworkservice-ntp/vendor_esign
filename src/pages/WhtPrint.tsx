import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Move } from 'lucide-react'
import { fetchWhtByIds, fetchWhtByScope } from '../lib/wht-source'
import { signDownload } from '../lib/r2-assets'
import { documentFileName, stamp } from '../lib/download-name'
import { loadBgDataUrl, sheetToA4PdfBytes } from '../lib/sheet-to-a4-pdf'
import { saveBlob } from '../lib/api-client'
import { useClientAuth } from '../lib/client-auth'
import { defaultSettings, type TenantSettings } from '../lib/settings'
import { useSettings, useUpdateSettings } from '../hooks/useSettings'
import {
  BG_IMAGE,
  CHECKMARK_POS,
  DEFAULT_SIGNATURE_PLACEMENT,
  DEFAULT_STAMP_PLACEMENT,
  FONT_FAMILY,
  PAGE_H,
  PAGE_W,
  buildFields,
  cssTop,
  type Placement,
  type WhtProfile,
} from '../lib/wht-form'
import {
  fmtWhtDate,
  fmtWhtNum,
  splitTaxId,
  thaiBahtText,
  type WhtRecordWithVendor,
} from '../lib/wht'
import { Button } from '../components/ui/button'
import { useToast } from '../components/ui/toast'
import { PositionableImage, SignaturePlacementPanel } from '../components/wht/signature-placement'

// Pixel-exact port of invoice-system's WHT print template
// (src/app/(client)/wht/print.tsx): a 1512×2138 Revenue-Department form image
// with absolutely-positioned fields, plus a clean A4 layout. The form model
// (coordinates, fields, fonts) lives in src/lib/wht-form.ts and is shared with
// the vector PDF renderer (src/lib/wht-pdf.ts) so print and download cannot drift.

function PndPage({
  record,
  profile,
  seq,
  bgSrc,
  signatureUrl,
  stampUrl,
  signaturePlacement,
  stampPlacement,
  editable,
  onSignaturePlacement,
  onStampPlacement,
}: {
  record: WhtRecordWithVendor
  profile: WhtProfile
  seq: number
  bgSrc: string
  signatureUrl?: string
  stampUrl?: string
  signaturePlacement: Placement
  stampPlacement: Placement
  editable: boolean
  onSignaturePlacement: (p: Placement) => void
  onStampPlacement: (p: Placement) => void
}) {
  const fields = buildFields(record, profile, seq)
  const check = CHECKMARK_POS[record.formType]
  return (
    <div className="print-sheet" style={{ width: PAGE_W + 'px', height: PAGE_H + 'px', position: 'relative', overflow: 'hidden', fontFamily: FONT_FAMILY }}>
      <img alt="form" src={bgSrc} style={{ position: 'absolute', inset: 0, width: PAGE_W + 'px', height: PAGE_H + 'px' }} />
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
        <PositionableImage
          url={stampUrl}
          label="ตราประทับ"
          placement={stampPlacement}
          editable={editable}
          opacity={0.85}
          onChange={onStampPlacement}
        />
      )}
      {signatureUrl && (
        <PositionableImage
          url={signatureUrl}
          label="ลายเซ็นผู้มีอำนาจ"
          placement={signaturePlacement}
          editable={editable}
          onChange={onSignaturePlacement}
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
  // The settings object the rendered `profile` was derived from. `profile` lags
  // `settings` by a render (it is copied across in an effect), so the auto-export
  // gate compares this to the loaded settings to avoid exporting defaults.
  const [profileSource, setProfileSource] = useState<TenantSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [stampUrl, setStampUrl] = useState<string | null>(null)
  const [signaturePlacement, setSignaturePlacement] = useState<Placement>(DEFAULT_SIGNATURE_PLACEMENT)
  const [stampPlacement, setStampPlacement] = useState<Placement>(DEFAULT_STAMP_PLACEMENT)
  const [editing, setEditing] = useState(false)
  // The form image inlined as a data URL, so a capture never races its first
  // load (falls back to the file path until it resolves).
  const [bgUrl, setBgUrl] = useState<string | undefined>(undefined)
  const autoExported = useRef(false)
  // `?download=1` (the list's "ดาวน์โหลดทั้งหมด" action) exports as soon as the
  // records + settings + signature/stamp are ready, instead of only previewing.
  const download = params.get('download') === '1'

  const { activeTenant } = useClientAuth()
  const { data: settings } = useSettings()
  const saveSettings = useUpdateSettings()
  const toast = useToast()

  useEffect(() => {
    void loadBgDataUrl()
      .then(setBgUrl)
      .catch(() => {
        /* keep the file-path fallback */
      })
  }, [])

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
        if (records.length === 0 && res.records.length === 0) {
          setErr('ไม่พบหนังสือรับรองตามเงื่อนไขที่เลือก')
        }
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

  // Company identity + the uploaded signature/stamp come from the workspace
  // settings (server-backed when wired). Built in its own effect so it fills in
  // when settings arrive after the records — the old code read localStorage and
  // so never saw them.
  useEffect(() => {
    const s = settings ?? defaultSettings(activeTenant)
    setProfile({
      company_name_th: s.displayName,
      tax_id: s.taxId,
      address: s.address,
      clientCode: s.clientCode,
      signatureStoragePath: s.signatureStoragePath,
      stampStoragePath: s.stampStoragePath,
    })
    setProfileSource(settings ?? null)
    // Placement is a saved per-workspace preference; seed the editor from it.
    setSignaturePlacement(s.signaturePlacement ?? DEFAULT_SIGNATURE_PLACEMENT)
    setStampPlacement(s.stampPlacement ?? DEFAULT_STAMP_PLACEMENT)
  }, [settings, activeTenant])

  const savePlacement = async () => {
    const base = settings ?? defaultSettings(activeTenant)
    try {
      await saveSettings.mutateAsync({ ...base, signaturePlacement, stampPlacement })
      toast.show('บันทึกตำแหน่งลายเซ็น/ตราประทับแล้ว')
    } catch {
      toast.show('บันทึกตำแหน่งไม่สำเร็จ', 'error')
    }
  }

  // Resolve the signature/stamp to data URLs whenever their storage paths
  // change. We fetch the presigned URL once here (as-is) and inline the bytes, so
  // html-to-image never has to fetch a cross-origin R2 URL during export — which
  // was appending a cache-buster that broke the signature and surfaced as a CORS
  // error. The preview and the PDF both use these data URLs.
  useEffect(() => {
    if (!profile) {
      setSignatureUrl(null)
      setStampUrl(null)
      return
    }
    let cancelled = false
    const toDataUrl = async (path?: string): Promise<string | null> => {
      if (!path) return null
      const signed = await signDownload(path)
      if (!signed) return null
      try {
        const r = await fetch(signed)
        if (!r.ok) return null
        const blob = await r.blob()
        return await new Promise<string>((resolve) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result))
          fr.onerror = () => resolve('')
          fr.readAsDataURL(blob)
        })
      } catch {
        return null
      }
    }
    void (async () => {
      const [sig, stamp] = await Promise.all([
        toDataUrl(profile.signatureStoragePath),
        toDataUrl(profile.stampStoragePath),
      ])
      if (!cancelled) {
        setSignatureUrl(sig)
        setStampUrl(stamp)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.signatureStoragePath, profile?.stampStoragePath])

  // One Revenue-Department form per certificate. A single record downloads as a
  // plain PDF; several are zipped, one file each — accountants file them per
  // vendor, not as one long PDF. The PND government form is drawn as vector text
  // over the form image (src/lib/wht-pdf.ts) so it matches the preview exactly;
  // the 'clean' sheet is flow-layout HTML and stays an html2canvas snapshot.
  const exportPdf = async () => {
    setErr('')
    setBusy(true)
    try {
      const used = new Set<string>()
      const uniqueName = (r: WhtRecordWithVendor): string => {
        const base = documentFileName({
          number: r.certificateNo || r.id,
          vendorName: r.vendorName,
          amount: r.amount,
        })
        if (!used.has(base)) {
          used.add(base)
          return base
        }
        const dot = base.lastIndexOf('.')
        const stem = dot > 0 ? base.slice(0, dot) : base
        const ext = dot > 0 ? base.slice(dot) : ''
        let n = 2
        while (used.has(`${stem}-${n}${ext}`)) n++
        const finalName = `${stem}-${n}${ext}`
        used.add(finalName)
        return finalName
      }

      const files: Record<string, Uint8Array> = {}

      // Rasterise the actual preview sheets (html-to-image → SVG foreignObject)
      // so the PDF is the browser's own rendering, exactly as shown — including
      // the signature/stamp placement. Turn the editor outline off and inline the
      // (large) form image first, so the first download has the background.
      setEditing(false)
      try {
        setBgUrl(await loadBgDataUrl())
      } catch {
        /* keep whatever background is already shown */
      }
      await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.print-sheet'))
      if (!sheets.length) throw new Error('no-sheets')
      for (let i = 0; i < sheets.length && i < records.length; i++) {
        files[uniqueName(records[i])] = await sheetToA4PdfBytes(sheets[i])
      }

      if (records.length === 1) {
        const [name] = Object.keys(files)
        saveBlob(new Blob([files[name].slice().buffer], { type: 'application/pdf' }), name)
      } else {
        const { zipSync } = await import('fflate')
        // PDFs are already compressed; store without re-deflating.
        const zipped = zipSync(files, { level: 0 })
        const period = scope.get('month') || 'all'
        saveBlob(new Blob([zipped.slice().buffer], { type: 'application/zip' }), `wht-certificates-${period}-${records.length}-docs-${stamp()}.zip`)
      }
    } catch {
      setErr('สร้าง PDF ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  // The list's "ดาวน์โหลดทั้งหมด" lands here with ?download=1: export as soon as
  // the records, settings and the signature/stamp URLs are ready, once.
  useEffect(() => {
    if (!download || autoExported.current) return
    // Wait for the rendered `profile` to be derived from the loaded settings. On
    // the render where `settings` first arrives, `profile` still holds the
    // defaultSettings seed (no signature/stamp paths), so checking `profile` here
    // would pass vacuously and export before the assets exist.
    if (!settings || profileSource !== settings) return
    if (loading || !profile || records.length === 0) return
    // A configured asset must have resolved to a URL before we render.
    if (settings.signatureStoragePath && !signatureUrl) return
    if (settings.stampStoragePath && !stampUrl) return
    autoExported.current = true
    void exportPdf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download, settings, profileSource, loading, profile, records, signatureUrl, stampUrl])

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
          {(signatureUrl || stampUrl) && (
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((v) => !v)}>
              <Move size={15} /> ปรับตำแหน่งลายเซ็น/ตราประทับ
            </Button>
          )}
          <Button variant="secondary" onClick={exportPdf} loading={busy}>
            <Download size={15} /> {busy ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="no-print mx-auto max-w-screen-xl px-4 py-3">
          <SignaturePlacementPanel
            signature={signaturePlacement}
            stamp={stampPlacement}
            hasSignature={!!signatureUrl}
            hasStamp={!!stampUrl}
            onChangeSignature={setSignaturePlacement}
            onChangeStamp={setStampPlacement}
            onReset={() => {
              setSignaturePlacement(DEFAULT_SIGNATURE_PLACEMENT)
              setStampPlacement(DEFAULT_STAMP_PLACEMENT)
            }}
            onSave={savePlacement}
            saving={saveSettings.isPending}
          />
        </div>
      )}
      {err && <p className="no-print px-4 py-3 text-sm font-medium text-danger">{err}</p>}
      {loading && <p className="no-print px-4 py-3 text-sm text-ink-500">กำลังโหลดหนังสือรับรอง…</p>}
      <div className="flex flex-col items-center gap-6 overflow-auto p-6">
        {profile &&
          records.map((r, i) =>
            layout === 'pnd'
              ? (
                <PndPage
                  key={r.id}
                  record={r}
                  profile={profile}
                  seq={i}
                  bgSrc={bgUrl ?? BG_IMAGE}
                  signatureUrl={signatureUrl ?? undefined}
                  stampUrl={stampUrl ?? undefined}
                  signaturePlacement={signaturePlacement}
                  stampPlacement={stampPlacement}
                  editable={editing}
                  onSignaturePlacement={setSignaturePlacement}
                  onStampPlacement={setStampPlacement}
                />
              )
              : <CleanPage key={r.id} record={r} profile={profile} />,
          )}
      </div>
    </div>
  )
}
