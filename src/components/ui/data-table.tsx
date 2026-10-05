import { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { SortDir } from '../../lib/sort'

// Shared table primitives for the registries (vendors, items). Extracted so the
// two lists can no longer drift on header, density, alignment, hover or focus.
// Consume roles only (ink-*, card-border, text-*) — see scripts/check-design.mjs.

export type Align = 'left' | 'right' | 'center'

export const tableCls = 'w-full border-collapse text-body'

const headCls =
  'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-4 py-2.5 text-left text-label font-medium text-ink-500'

const alignCls = (a?: Align) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : undefined)

export function Th({
  align,
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <th scope="col" className={cn(headCls, alignCls(align), className)} {...rest}>
      {children}
    </th>
  )
}

/** A click-to-sort header cell. Pair with `useColumnSort` + `sortRows`. */
export function SortableTh({
  label,
  active,
  dir,
  onSort,
  align,
  className,
  ...rest
}: {
  label: string
  active: boolean
  dir: SortDir
  onSort: () => void
  align?: Align
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick' | 'children'>) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(headCls, alignCls(align), className)}
      {...rest}
    >
      <button
        type="button"
        onClick={onSort}
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

export function Td({
  align,
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <td className={cn('px-4 py-3 align-middle', alignCls(align), className)} {...rest}>
      {children}
    </td>
  )
}

/** The one row treatment: clickable, keyboard-openable, consistent hover/focus. */
export function ClickableRow({
  onOpen,
  label,
  archived,
  className,
  children,
}: {
  onOpen: () => void
  label: string
  archived?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'cursor-pointer border-b border-card-border transition last:border-0 hover:bg-ink-50 focus:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900',
        archived && 'opacity-60',
        className,
      )}
    >
      {children}
    </tr>
  )
}

/** A plain (non-interactive) row, e.g. the items catalogue. */
export function Row({ archived, className, children }: { archived?: boolean; className?: string; children: ReactNode }) {
  return (
    <tr className={cn('border-b border-card-border transition last:border-0 hover:bg-ink-50', archived && 'opacity-60', className)}>
      {children}
    </tr>
  )
}

/** Registry code (VEN-001 / ITM-001): monospace, tabular, muted chip. */
export function RegistryId({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-mono text-label font-medium tabular-nums text-ink-600',
        className,
      )}
    >
      {code}
    </span>
  )
}

/** Thin indeterminate progress bar shown above a table while refetching. */
export function LoadingBar({ show, label }: { show: boolean; label: string }) {
  if (!show) return null
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-primary-soft" role="progressbar" aria-label={label}>
      <div className="h-full w-1/3 animate-pulse bg-primary" />
    </div>
  )
}
