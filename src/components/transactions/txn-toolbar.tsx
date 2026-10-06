import { useRef } from 'react'
import { AlertTriangle, Keyboard, SlidersHorizontal, X } from 'lucide-react'
import type { ActiveFilter, SortKey, TransactionFilters } from '../../lib/txn-filters'
import { activeFilterCount } from '../../lib/txn-filters'
import { cn } from '../../lib/cn'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { FilterChip } from '../ui/filter-chip'
import { FilterSummary } from '../ui/filter-summary'

const SORTS: { v: SortKey; th: string }[] = [
  { v: 'urgency-desc', th: 'เร่งด่วนสุด' },
  { v: 'created-desc', th: 'แก้ไขล่าสุด' },
  { v: 'date-desc', th: 'วันที่โอน' },
  { v: 'net-desc', th: 'ยอดสุทธิ' },
]

export function TxnToolbar({
  filters,
  search,
  onSearch,
  onPatch,
  onTogglePanel,
  panelOpen,
  active,
  searchRef,
  chips,
  onClearFilter,
  onOpenShortcuts,
  className,
}: {
  filters: TransactionFilters
  search: string
  onSearch: (v: string) => void
  onPatch: (patch: Partial<TransactionFilters>) => void
  onTogglePanel: () => void
  panelOpen: boolean
  active: ActiveFilter[]
  searchRef: React.RefObject<HTMLInputElement>
  chips: { v: TransactionFilters['status']; th: string }[]
  onClearFilter: (key: ActiveFilter['key']) => void
  onOpenShortcuts?: () => void
  className?: string
}) {
  const count = activeFilterCount(filters)
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = searchRef ?? localRef

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor="txn-search" className="sr-only">
            ค้นหารายการธุรกรรม
          </label>
          <Input
            id="txn-search"
            ref={inputRef}
            className={cn('pl-10', search && 'pr-10')}
            placeholder="ค้นหาชื่อผู้ขาย / รายละเอียด / เลขใบเสร็จ / สลิป…  ( / )"
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
                inputRef.current?.focus()
              }}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Select
            value={SORTS.some((s) => s.v === filters.sort) ? filters.sort : 'created-desc'}
            onChange={(e) => onPatch({ sort: e.target.value as SortKey })}
            aria-label="เรียงลำดับ"
            title="เรียงลำดับรายการ"
            className="h-8 w-auto rounded-full text-body"
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.th}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={onTogglePanel}
            aria-expanded={panelOpen}
            aria-controls="txn-filter-panel"
            title="ตัวกรอง (f)"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-body transition',
              panelOpen || count > 0
                ? 'border-primary/30 bg-primary-soft font-semibold text-primary-text'
                : 'border-transparent bg-ink-100 font-medium text-ink-700 hover:bg-ink-300/50',
            )}
          >
            <SlidersHorizontal size={14} aria-hidden /> ตัวกรอง
            {count > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-label tabular-nums">{count}</span>
            )}
          </button>
          {onOpenShortcuts && (
            <button
              type="button"
              onClick={onOpenShortcuts}
              title="คีย์ลัด (?)"
              aria-label="ดูคีย์ลัด"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <Keyboard size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-card-border pt-3">
        <span className="mr-1 text-label font-medium text-ink-500">คิวงาน</span>
        {chips.map((c) => (
          <FilterChip key={c.v} active={filters.status === c.v} onClick={() => onPatch({ status: c.v })}>
            {c.th}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-card-border" aria-hidden />
        <FilterChip
          active={filters.attention}
          onClick={() => onPatch({ attention: !filters.attention })}
          title="รายการที่ต้องติดตาม: ลิงก์หมดอายุ รอผู้ขายเกิน 3 วัน ร่างค้าง หรือยังไม่แนบสลิป"
        >
          <AlertTriangle size={13} aria-hidden /> ต้องติดตาม
        </FilterChip>
      </div>

      <FilterSummary
        filters={active}
        onClear={onClearFilter}
        className="flex flex-wrap items-center gap-1.5 border-t border-card-border pt-3"
      />
    </div>
  )
}
