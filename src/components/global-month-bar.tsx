import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { useTransactionMonths } from '../hooks/useTransactions'
import { formatMonthTH, monthHasData, monthPresets } from '../lib/global-month'
import { Select } from './ui/select'

// Global accounting-period bar. Rendered under the portal header for client
// pages (hidden on /admin/*, which is a separate operation). One month drives
// Transactions (transferDate) + WHT (issueDate) + Metrics (transferDate);
// custom date ranges on the list page clear it (mutual exclusion).
//
// Professional period control: ‹ › steppers walk months one at a time (the
// month-end-close workflow); the dropdown lists only months that actually
// have transactions (newest first, Thai labels) plus "all time". Stepping
// forward stops at the current month — future periods are unreachable.
// The month list comes from a dedicated distinct-months query, so the bar does
// not depend on the list page's current page of rows.
export function GlobalMonthBar() {
  const loc = useLocation()
  const { month, setMonth, clearMonth, step, canStepNext, isAllTime, thisMonth } = useGlobalMonth()
  const { data: dataMonths } = useTransactionMonths()

  const presets = useMemo(
    () => monthPresets(dataMonths ?? [], thisMonth),
    [dataMonths, thisMonth],
  )

  if (loc.pathname.startsWith('/admin')) return null

  // A stored month outside the preset window (or from a shared link) must
  // still display — include it so the select never shows a blank value.
  const options = useMemo(() => {
    const list = month && !presets.includes(month) ? [month, ...presets] : presets
    return [...list].sort().reverse()
  }, [month, presets])

  const stepBtn =
    'grid h-9 w-9 shrink-0 place-items-center rounded-control border border-card-border bg-white text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-ink-600'

  return (
    <div className="no-print border-b border-card-border/70 bg-ink-50/60">
      {/* No max-w: matches main, which was widened to the full viewport so wide
          tables and stat grids get the space. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:px-6">
        <label htmlFor="global-month" className="text-label font-medium text-ink-500">
          รอบเดือน
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            title="เดือนก่อนหน้า"
            aria-label="เดือนก่อนหน้า"
            className={stepBtn}
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <Select
            id="global-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="รอบเดือนบัญชี (มีผลกับรายการธุรกรรม ภาษีหัก ณ ที่จ่าย และภาพรวม)"
            title="ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง"
            className="h-9 w-auto min-w-36 pr-9 text-body font-semibold tabular-nums"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m === thisMonth ? `เดือนนี้ · ${formatMonthTH(m)}` : formatMonthTH(m)}
                {monthHasData(m, dataMonths ?? []) ? '' : ' · ว่าง'}
              </option>
            ))}
            <option value="">ทั้งหมด</option>
          </Select>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!canStepNext}
            title="เดือนถัดไป"
            aria-label="เดือนถัดไป"
            className={stepBtn}
          >
            <ChevronRight size={17} aria-hidden />
          </button>
          {!isAllTime && (
            <button
              type="button"
              onClick={clearMonth}
              title="แสดงทั้งหมด (ไม่จำกัดเดือน)"
              aria-label="แสดงทั้งหมด ไม่จำกัดเดือน"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
        <span className="text-body text-ink-500" aria-live="polite">
          {isAllTime ? 'ทั้งหมด (ไม่จำกัดเดือน)' : ` · ${formatMonthTH(month)}`}
        </span>
        <span className="hidden text-label text-ink-400 xl:inline" title="ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง">
          ธุรกรรม: วันที่โอน · หัก ณ ที่จ่าย: วันที่ออกหนังสือรับรอง
        </span>
      </div>
    </div>
  )
}
