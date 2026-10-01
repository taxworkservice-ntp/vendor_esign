import { CalendarRange, RotateCcw } from 'lucide-react'
import type { TransactionFilters } from '../../lib/txn-filters'
import { isCustomRange } from '../../lib/txn-filters'
import { formatMonthTH } from '../../lib/global-month'

/**
 * Shown while this list is showing a custom date range instead of the app-wide
 * period.
 *
 * A list-local range deliberately leaves the header period alone, so without
 * this notice a changed month in the bar looks like it is being ignored. The
 * copy says exactly what is happening and offers the way back in one click —
 * no Apply button, because this is a view state, not a pending action.
 */
export function CustomRangeNotice({
  filters,
  globalMonth,
  onUsePeriod,
  onClearRange,
}: {
  filters: TransactionFilters
  globalMonth: string
  onUsePeriod: () => void
  onClearRange: () => void
}) {
  if (!isCustomRange(filters)) return null
  const label = filters.from && filters.to
    ? `${filters.from} – ${filters.to}`
    : filters.from
      ? `ตั้งแต่ ${filters.from}`
      : `ถึง ${filters.to}`

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-body"
      role="status"
    >
      <CalendarRange size={16} className="shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1 text-warning">
        กำลังดูช่วงที่กำหนดเอง <span className="font-mono font-semibold">{label}</span>
        <span className="ml-1 text-warning/80">
          (ไม่ใช่รอบ{globalMonth ? ` ${formatMonthTH(globalMonth)}` : 'ทั้งหมด'} ในแถบด้านบน — หน้าอื่นยังใช้รอบเดิม)
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        {filters.from || filters.to ? (
          <button
            type="button"
            onClick={onClearRange}
            className="rounded-control px-2.5 py-1.5 text-label font-semibold text-warning underline-offset-2 transition hover:underline"
          >
            ล้างช่วงวันที่
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUsePeriod}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary-deep px-2.5 py-1.5 text-label font-semibold text-white transition hover:bg-primary-deeper"
        >
          <RotateCcw size={13} aria-hidden />
          กลับไปใช้รอบ{globalMonth ? formatMonthTH(globalMonth) : 'ทั้งหมด'}
        </button>
      </div>
    </div>
  )
}
