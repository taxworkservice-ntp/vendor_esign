import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { SortField, SortKey } from '../../lib/txn-filters'
import { nextSort, sortDir, sortField } from '../../lib/txn-filters'
import { cn } from '../../lib/cn'
import { Checkbox } from '../ui/checkbox'
import { TxnRow } from './txn-row'
import type { PaymentTransaction } from '../../lib/types'

// Table shell: sortable header, select-all, and the loading skeleton.

const thBase =
  'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-3 py-2.5 text-label font-semibold uppercase tracking-wide text-ink-500'

function SortHeader({
  field,
  label,
  sort,
  onSort,
  align = 'left',
}: {
  field: SortField
  label: string
  sort: SortKey
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortField(sort) === field
  const dir = sortDir(sort)
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      className={cn(thBase, align === 'right' && 'text-right')}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, field))}
        className={cn(
          'inline-flex items-center gap-1 transition hover:text-ink-900',
          align === 'right' && 'flex-row-reverse',
          active && 'text-ink-900',
        )}
      >
        {label}
        <Icon size={13} className={active ? '' : 'text-ink-300'} aria-hidden />
      </button>
    </th>
  )
}

function SkeletonRows({ rows, dense }: { rows: number; dense: boolean }) {
  const pad = dense ? 'py-1.5' : 'py-2.5'
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td className={cn('border-b border-card-border pl-3 pr-0', pad)} />
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="h-3.5 w-32 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="h-3.5 w-52 animate-pulse rounded bg-ink-100" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="h-3.5 w-20 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="h-3.5 w-24 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="ml-auto h-3.5 w-14 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-3', pad)}>
            <div className="h-5 w-20 animate-pulse rounded-full bg-ink-100" />
          </td>
          <td className={cn('border-b border-card-border px-2', pad)} />
        </tr>
      ))}
    </>
  )
}

export function TxnTable({
  rows,
  sort,
  onSort,
  selected,
  onToggle,
  onTogglePage,
  onOpen,
  loading,
  dense,
}: {
  rows: PaymentTransaction[]
  sort: SortKey
  onSort: (k: SortKey) => void
  selected: Set<string>
  onToggle: (id: string) => void
  onTogglePage: () => void
  onOpen: (id: string) => void
  loading: boolean
  dense: boolean
}) {
  const pageIds = rows.map((r) => r.id)
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length
  const someSelected = selectedOnPage > 0 && !allSelected

  return (
    // border-collapse (not border-separate) so the per-cell border-b rules
    // produce one hairline per row, matching the other list pages.
    <table className="w-full min-w-[1120px] border-collapse text-body">
      <thead>
        <tr>
          <th className={cn(thBase, 'w-9 pl-3 pr-0')}>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onTogglePage}
              label="เลือกทั้งหน้านี้"
              hideLabel
            />
          </th>
          <SortHeader field="vendor" label="ผู้ขาย" sort={sort} onSort={onSort} />
          <th className={thBase}>รายการ</th>
          <SortHeader field="date" label="วันที่โอน" sort={sort} onSort={onSort} />
          <th className={thBase}>เลขที่ใบเสร็จ</th>
          <SortHeader field="gross" label="ยอดรวม (บาท)" sort={sort} onSort={onSort} align="right" />
          <SortHeader field="wht" label="หัก ณ ที่จ่าย" sort={sort} onSort={onSort} align="right" />
          <SortHeader field="net" label="สุทธิ (บาท)" sort={sort} onSort={onSort} align="right" />
          <SortHeader field="status" label="สถานะ" sort={sort} onSort={onSort} />
          <th className={cn(thBase, 'w-14 text-right')}>
            <span className="sr-only">จัดการ</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <SkeletonRows rows={dense ? 8 : 6} dense={dense} />
        ) : (
          rows.map((t) => (
            <TxnRow
              key={t.id}
              t={t}
              dense={dense}
              selected={selected.has(t.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))
        )}
      </tbody>
    </table>
  )
}

export function TxnTableFrame({ children, fetching }: { children: ReactNode; fetching?: boolean }) {
  return (
    <div className="relative">
      {/* Thin progress bar: a filter change must never look like nothing happened. */}
      {fetching && (
        <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-primary-soft" role="progressbar" aria-label="กำลังโหลดรายการ">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto">{children}</div>
    </div>
  )
}
