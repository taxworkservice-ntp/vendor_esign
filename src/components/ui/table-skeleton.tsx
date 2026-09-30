import { cn } from '../../lib/cn'

// Generic loading placeholder rows for simple tables. Render inside <tbody>.
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-card-border">
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
