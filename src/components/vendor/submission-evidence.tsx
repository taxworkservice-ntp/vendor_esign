import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import type { VendorInviteDraft } from '../../lib/vendor-invite'
import { fmtDateTimeTHLong } from '../../lib/format'
import { saveFile } from '../../lib/api-client'
import { Button } from '../ui/button'

// Vendor-facing proof of what was submitted: a clean, printable card that is
// also the on-screen preview for the "download PDF" button. Deliberately
// self-contained (no server round-trip) — the vendor can keep it or screenshot
// it. Masks nothing: these are the vendor's own details.

export interface SubmissionEvidenceData {
  inviteRef: string
  submittedAt?: string
  consentVersion?: string
  docs?: { id: boolean; bank: boolean }
  draft: VendorInviteDraft
  clientName?: string
  logoUrl?: string | null
}

function groupTaxId(id: string): string {
  const d = id.replace(/\D/g, '')
  if (d.length !== 13) return id
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`
}

function attachments(docs?: { id: boolean; bank: boolean }): string {
  const bank = docs?.bank ? 'แนบ' : 'ไม่ได้แนบ'
  return `บัตรประชาชน (แนบ) · หน้าสมุดบัญชี (${bank})`
}

export function SubmissionEvidence({ data }: { data: SubmissionEvidenceData }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const d = data.draft
  const name = `${d.prefix} ${d.name}`.trim()

  const download = async () => {
    const el = cardRef.current
    if (!el) return
    setDownloading(true)
    try {
      // Loaded lazily so this component stays light (jsPDF/html-to-image only
      // load when the vendor actually downloads).
      const { elementToA4PdfBytes } = await import('../../lib/receipt-to-a4-pdf')
      // The evidence is a short card, not an A4 sheet — preserve its proportions
      // instead of stretching it to fill the page.
      const bytes = await elementToA4PdfBytes(el, { fit: 'contain' })
      await saveFile(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), `vendor-onboard-${data.inviteRef}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div ref={cardRef} className="rounded-card border border-card-border bg-white p-5 sm:p-6">
        <div className="border-b border-card-border pb-3">
          <h2 className="text-title font-semibold">หลักฐานการส่งข้อมูลผู้ขาย</h2>
          <p className="mt-0.5 text-label text-ink-500">เลขที่อ้างอิง {data.inviteRef}</p>
        </div>

        <dl className="mt-3 space-y-2">
          <Row label="ผู้ว่าจ้าง" value={data.clientName || '—'} />
          <Row label="วันที่ส่งข้อมูล" value={data.submittedAt ? fmtDateTimeTHLong(data.submittedAt) : '—'} />
          <Row label="ชื่อผู้ขาย" value={name} />
          <Row label="ที่อยู่" value={d.address || '—'} />
          <Row label="เลขบัตรประชาชน / ผู้เสียภาษี" value={groupTaxId(d.taxId)} mono />
          <Row label="ธนาคาร" value={d.bankName || '—'} />
          <Row label="เลขที่บัญชี" value={d.bankAccount || '—'} mono />
          <Row label="ชื่อบัญชี" value={d.accountHolder || '—'} />
          {d.phone && <Row label="โทรศัพท์" value={d.phone} />}
          {d.email && <Row label="อีเมล" value={d.email} />}
          <Row label="เอกสารแนบ" value={attachments(data.docs)} />
          <Row label="เวอร์ชันความยินยอม" value={data.consentVersion || '—'} />
        </dl>

        <p className="mt-4 border-t border-card-border pt-3 text-label leading-relaxed text-ink-400">
          เอกสารนี้เป็นหลักฐานการส่งข้อมูลของผู้ขาย ไม่ใช่เอกสารทางภาษี · จัดทำโดยระบบ TW VendorSign
        </p>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void download()} loading={downloading}>
          <Download size={15} aria-hidden /> {downloading ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด PDF'}
        </Button>
        <p className="text-label text-ink-400">หรือบันทึกภาพหน้าจอเก็บไว้เป็นหลักฐานได้</p>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[10.5rem_1fr] gap-2">
      <dt className="text-label text-ink-500">{label}</dt>
      <dd className={mono ? 'font-mono text-body' : 'text-body'}>{value}</dd>
    </div>
  )
}
