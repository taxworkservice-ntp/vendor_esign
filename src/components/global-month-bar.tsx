import { RotateCcw, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { formatMonthTH } from '../lib/global-month'
import { monthOffset } from '../lib/txn-filters'
import { cn } from '../lib/cn'

// Global accounting-period bar. Rendered under the portal header for client
// pages (hidden on /admin/*, which is a separate operation). One month drives
// Transactions (transferDate) + WHT (issueDate) + Metrics (transferDate);
// custom date ranges on the list page clear it (mutual exclusion).
export function GlobalMonthBar() {
  const loc = useLocation()
  const { month, setMonth, clearMonth, isAllTime, isCurrentMonth, thisMonth, prevMonth } = useGlobalMonth()

  if (loc.pathname.startsWith('/admin')) return null

  return (
    <div className="no-print border-b border-card-border/70 bg-ink-50/60">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <label htmlFor="global-month" className="text-label font-semibold text-ink-500">
          รอบเดือน
        </label>
        <input
          id="global-month"
          type="month"
          value={month}
          max={monthOffset(1)}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="รอบเดือนบัญชี (มีผลกับรายการธุรกรรม ภาษีหัก ณ ที่จ่าย และภาพรวม)"
          title="ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง"
          className="h-9 rounded-control border border-card-border bg-white px-2.5 text-body tabular-nums outline-none transition focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10"
        />
        {!isAllTime && (
          <span className="text-body font-semibold tabular-nums" aria-live="polite">
            {formatMonthTH(month)}
          </span>
        )}
        {isAllTime && (
          <span className="text-body text-ink-500" aria-live="polite">
            ทั้งหมด (ไม่จำกัดเดือน)
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMonth(thisMonth)}
            className={cn(
              'rounded-full px-3 py-1 text-body font-semibold transition',
              month === thisMonth ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-300/50',
            )}
          >
            เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => setMonth(prevMonth)}
            className={cn(
              'rounded-full px-3 py-1 text-body font-semibold transition',
              month === prevMonth ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-300/50',
            )}
          >
            เดือนก่อน
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setMonth(thisMonth)}
              title="กลับไปเดือนปัจจุบัน"
              aria-label="กลับไปเดือนปัจจุบัน"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {!isAllTime && (
            <button
              type="button"
              onClick={clearMonth}
              title="แสดงทั้งหมด (ไม่จำกัดเดือน)"
              aria-label="แสดงทั้งหมด ไม่จำกัดเดือน"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="hidden text-label text-ink-400 xl:inline" title="ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง">
          ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง
        </span>
      </div>
    </div>
  )
}
