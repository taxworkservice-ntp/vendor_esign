import { ReactNode, RefObject } from 'react'
import { RotateCcw, Search, X } from 'lucide-react'
import { Input } from './input'
import { Select } from './select'
import { cn } from '../../lib/cn'

// The search / sort / archive toolbar shared by the vendor and item registries.
// Both pages had their own copy; this keeps them identical and lets each page
// add a little context (e.g. the vendor register's outstanding total).

export interface SortOption<T extends string> {
  v: T
  th: string
}

interface Props<T extends string> {
  searchId: string
  search: string
  onSearch: (v: string) => void
  placeholder: string
  inputRef?: RefObject<HTMLInputElement>
  /** Optional: omit to hide the sort dropdown (e.g. when headers are sortable). */
  sort?: T
  onSort?: (v: T) => void
  sorts?: readonly SortOption<T>[]
  sortAriaLabel?: string
  sortWidth?: string
  archived: boolean
  onArchived: (v: boolean) => void
  archivedLabel: string
  count: number
  loading?: boolean
  /** Extra context shown next to the count (e.g. total outstanding). */
  extra?: ReactNode
  onClear: () => void
}

export function RegistryToolbar<T extends string>({
  searchId,
  search,
  onSearch,
  placeholder,
  inputRef,
  sort,
  onSort,
  sorts,
  sortAriaLabel,
  sortWidth = 'min-w-44',
  archived,
  onArchived,
  archivedLabel,
  count,
  loading,
  extra,
  onClear,
}: Props<T>) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            {placeholder}
          </label>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            id={searchId}
            ref={inputRef}
            className={cn('pl-10', search && 'pr-10')}
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                e.stopPropagation()
                onSearch('')
              }
            }}
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                onSearch('')
                inputRef?.current?.focus()
              }}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>

        {sorts && onSort && (
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-label text-ink-500">เรียงตาม</span>
            <Select
              value={sort}
              onChange={(e) => onSort(e.target.value as T)}
              aria-label={sortAriaLabel}
              className={cn('h-9 w-auto', sortWidth)}
            >
              {sorts.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.th}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-card-border pt-3 text-label">
        <span className="text-ink-500" aria-live="polite">
          {loading ? 'กำลังโหลด…' : `${count.toLocaleString('th-TH')} รายการ`}
        </span>
        {extra}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => onArchived(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-ink-900"
          />
          {archivedLabel}
        </label>
        {search.trim() !== '' && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <RotateCcw size={13} aria-hidden /> ล้างคำค้นหา
          </button>
        )}
      </div>
    </div>
  )
}
