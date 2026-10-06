import { Copy, Download, Link2, X } from 'lucide-react'

/**
 * Bulk action bar, shown only while rows are selected. Actions stay safe for a
 * mixed selection: create/preview vendor links, or export. Nothing here voids or
 * issues a document.
 */
export function TxnBulkBar({
  count,
  createCount,
  messageCount,
  onCreateLinks,
  onPreviewMessages,
  onExport,
  onClear,
}: {
  count: number
  /** Selected rows in a link status that still have no link. */
  createCount: number
  /** Selected rows in a link status (the ones the message will cover). */
  messageCount: number
  onCreateLinks: () => void
  onPreviewMessages: () => void
  onExport: () => void
  onClear: () => void
}) {
  if (count === 0) return null

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-card-border bg-ink-50 px-3 py-2.5"
      role="region"
      aria-label="เครื่องมือสำหรับรายการที่เลือก"
    >
      <span className="text-body font-semibold tabular-nums">เลือกแล้ว {count} รายการ</span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onCreateLinks}
          disabled={createCount === 0}
          title={createCount === 0 ? 'ทุกรายการที่เลือกมีลิงก์แล้ว' : 'สร้างลิงก์สำหรับรายการที่ยังไม่มี'}
          className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-body font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Link2 size={14} aria-hidden /> สร้างลิงก์ ({createCount})
        </button>
        <button
          type="button"
          onClick={onPreviewMessages}
          disabled={messageCount === 0}
          title={messageCount === 0 ? 'ไม่มีรายการที่ต้องส่งลิงก์ให้ผู้ขาย' : 'ดูข้อความสำหรับส่งให้ผู้ขาย'}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-card-border bg-white px-3 text-body font-semibold text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy size={14} aria-hidden /> ข้อความส่งผู้ขาย ({messageCount})
        </button>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-card-border bg-white px-3 text-body font-semibold text-ink-700 transition hover:bg-ink-100"
        >
          <Download size={14} aria-hidden /> ส่งออกที่เลือก
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-body font-semibold text-ink-600 transition hover:bg-ink-100"
        >
          <X size={14} aria-hidden /> ยกเลิกการเลือก
        </button>
      </div>
    </div>
  )
}

/** "Select all N matching" affordance, offered when the page is not everything. */
export function SelectAllMatching({ total, onSelectAll }: { total: number; onSelectAll: () => void }) {
  if (total <= 0) return null
  return (
    <p className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-label text-ink-500">
      <Link2 size={12} aria-hidden />
      กำลังแสดงบางส่วนของผลการค้นหา
      <button
        type="button"
        onClick={onSelectAll}
        className="rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-700 transition hover:bg-ink-300/50"
      >
        เลือกทั้งหมด {total.toLocaleString('th-TH')} รายการ
      </button>
    </p>
  )
}
