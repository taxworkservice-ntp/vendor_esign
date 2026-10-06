import { Copy, Download, Link2, X } from 'lucide-react'

export function TxnBulkBar({
  count,
  createCount,
  messageCount,
  onCreateLinks,
  onPreviewMessages,
  onExport,
  onClear,
  busy,
  progress,
}: {
  count: number
  createCount: number
  messageCount: number
  onCreateLinks: () => void
  onPreviewMessages: () => void
  onExport: () => void
  onClear: () => void
  busy?: boolean
  progress?: { done: number; total: number } | null
}) {
  if (count === 0) return null

  return (
    <div className="sticky bottom-4 z-30 px-3 pb-1">
      <div
        className="flex flex-wrap items-center gap-2 rounded-card border border-card-border bg-white/95 px-3 py-2.5 shadow-card backdrop-blur"
        role="region"
        aria-label="เครื่องมือสำหรับรายการที่เลือก"
        aria-busy={busy || undefined}
      >
        <span className="text-body font-semibold tabular-nums">เลือกแล้ว {count} รายการ</span>
        {progress && progress.total > 0 && (
          <span className="text-label tabular-nums text-ink-500" role="status">
            {progress.done}/{progress.total}
          </span>
        )}
        {progress && progress.total > 0 && (
          <div className="h-1 min-w-24 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onCreateLinks}
            disabled={createCount === 0 || busy}
            title={createCount === 0 ? 'ทุกรายการที่เลือกมีลิงก์แล้ว' : 'สร้างลิงก์สำหรับรายการที่ยังไม่มี'}
            className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-body font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Link2 size={14} aria-hidden /> สร้างลิงก์ ({createCount})
          </button>
          <button
            type="button"
            onClick={onPreviewMessages}
            disabled={messageCount === 0 || busy}
            title={messageCount === 0 ? 'ไม่มีรายการที่ต้องส่งลิงก์ให้ผู้ขาย' : 'ดูข้อความสำหรับส่งให้ผู้ขาย'}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-card-border bg-white px-3 text-body font-semibold text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy size={14} aria-hidden /> ข้อความส่งผู้ขาย ({messageCount})
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-card-border bg-white px-3 text-body font-semibold text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} aria-hidden /> ส่งออกที่เลือก
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-body font-semibold text-ink-600 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={14} aria-hidden /> ยกเลิกการเลือก
          </button>
        </div>
      </div>
    </div>
  )
}

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
