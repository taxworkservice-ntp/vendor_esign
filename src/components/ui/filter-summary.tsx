import { X } from 'lucide-react'
import type { ActiveFilter } from '../../lib/txn-filters'

/**
 * Removable chips for the filters currently narrowing the list. The toolbar
 * badge says how many; these say which, so a user does not have to reopen the
 * panel to find out why the list is short.
 */
export function FilterSummary({
  filters,
  onClear,
  className,
}: {
  filters: ActiveFilter[]
  onClear: (key: ActiveFilter['key']) => void
  className?: string
}) {
  if (filters.length === 0) return null

  return (
    <ul className={className} aria-label="ตัวกรองที่ใช้อยู่">
      {filters.map((f) => (
        <li key={f.key}>
          <span className="inline-flex max-w-[22rem] items-center gap-1 rounded-full border border-card-border bg-white py-1 pl-2.5 pr-1 text-label text-ink-700">
            <span className="truncate">{f.label}</span>
            <button
              type="button"
              onClick={() => onClear(f.key)}
              aria-label={`ล้างตัวกรอง ${f.label}`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        </li>
      ))}
      {filters.length > 1 && (
        <li>
          <button
            type="button"
            onClick={() => filters.forEach((f) => onClear(f.key))}
            className="rounded-full px-2.5 py-1 text-label font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            ล้างทั้งหมด
          </button>
        </li>
      )}
    </ul>
  )
}
