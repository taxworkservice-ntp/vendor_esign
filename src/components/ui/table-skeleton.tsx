import { cn } from '../../lib/cn'

/**
 * Generic loading placeholder rows for simple tables. Render inside <tbody>.
 *
 * These emit <tr>/<td>, so they are only valid as table children. They used to be
 * the only skeleton in the app and were also dropped into <Card><CardBody> (a
 * <div>) on the detail pages, which made React emit a validateDOMNesting warning
 * and left the browser to hoist the rows out of the card entirely — the loading
 * state did not look like the panel it was standing in for. Use PanelSkeleton in
 * a non-table container; this one stays table-only.
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-card-border last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div className={cn('h-3.5 animate-pulse rounded bg-ink-100', c === 0 ? 'w-40' : 'ml-auto w-14')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * Same idea for a card or panel that is not a table — div-based so it nests
 * correctly. `cols` controls how many placeholder bars per row; the widths are
 * staggered so it reads as content rather than a grid of identical bricks.
 */
export function PanelSkeleton({ rows = 5, cols = 2 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="flex-1 space-y-2">
              <div className={cn('h-2.5 w-24 animate-pulse rounded bg-ink-100', r === 0 && c === 0 && 'w-32')} />
              <div className="h-3.5 w-full animate-pulse rounded bg-ink-100/80" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}