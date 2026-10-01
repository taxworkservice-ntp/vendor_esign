import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES } from '../../lib/txn-list-query'
import { pageCount, pageRange } from '../../lib/txn-filters'
import { cn } from '../../lib/cn'
import { Select } from './select'

/**
 * Paging control for a server-paged list. Shows the visible range and the total
 * so the user can tell a filtered set from a truncated one, and never renders
 * controls that cannot do anything.
 *
 * Page numbers collapse to first / … / current ±1 / … / last so the control
 * keeps a fixed width no matter how many pages there are.
 */
export function Pagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
  onPageSize,
  className,
}: {
  page: number
  pageSize: number
  total: number
  busy?: boolean
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  className?: string
}) {
  const pages = pageCount(total, pageSize)
  const { from, to } = pageRange(page, pageSize, total)
  const atStart = page <= 0
  const atEnd = page >= pages - 1

  const navBtn =
    'grid h-8 w-8 shrink-0 place-items-center rounded-control border border-card-border bg-white text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-ink-600'

  // first, last, and a window around the current page
  const shown = new Set<number>([0, pages - 1, page, page - 1, page + 1])
  const visible = [...shown].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b)

  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-card-border px-3 py-2.5', className)}
    >
      <div className="flex items-center gap-2 text-label text-ink-500">
        <span aria-live="polite">
          {total === 0 ? 'ไม่มีรายการ' : `แสดง ${from}–${to} จากทั้งหมด ${total.toLocaleString('th-TH')} รายการ`}
        </span>
        <label className="ml-1 flex items-center gap-1.5">
          <span className="whitespace-nowrap">ต่อหน้า</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="จำนวนรายการต่อหน้า"
            className="h-8 w-auto min-w-16 pr-7 text-label"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {pages > 1 && (
        <nav aria-label="แบ่งหน้า" className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(page - 1)} disabled={atStart || busy} className={navBtn} aria-label="หน้าก่อนหน้า">
            <ChevronLeft size={16} aria-hidden />
          </button>

          {visible.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && visible[i - 1] !== p - 1 && <span className="px-0.5 text-ink-400" aria-hidden>…</span>}
              <button
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`หน้า ${p + 1}`}
                className={cn(
                  'h-8 min-w-8 rounded-control px-2 text-label tabular-nums transition',
                  // The current page is the one selection in this control worth a
                  // filled state, so it gets the solid accent (5.75:1 with white)
                  // rather than the near-black it used to use.
                  p === page
                    ? 'bg-primary font-semibold text-white'
                    : 'font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                {p + 1}
              </button>
            </span>
          ))}

          <button type="button" onClick={() => onPage(page + 1)} disabled={atEnd || busy} className={navBtn} aria-label="หน้าถัดไป">
            <ChevronRight size={16} aria-hidden />
          </button>
        </nav>
      )}
    </div>
  )
}
