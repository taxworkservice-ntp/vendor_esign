import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

// Single page-header pattern app-wide: optional breadcrumb + title + muted
// subtitle + right actions. The breadcrumb is how every sub-page gets a
// consistent way back to its parent (deterministic routes, not history), so a
// refresh or a deep link still lands on a sensible "up".

export interface Crumb {
  /** Omit `to` for the current (last) crumb. */
  to?: string
  label: string
}

export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-body text-ink-600">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="text-ink-400" aria-hidden />}
            {c.to ? (
              <Link
                to={c.to}
                className="inline-flex items-center gap-1 rounded font-medium text-ink-700 underline-offset-2 transition hover:text-primary-text hover:underline"
              >
                {i === 0 && <ArrowLeft size={15} aria-hidden />}
                {c.label}
              </Link>
            ) : (
              <span className="font-semibold text-ink-900" aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function PageHeader({
  title,
  sub,
  actions,
  breadcrumb,
  className,
}: {
  title: string
  sub?: string
  actions?: ReactNode
  breadcrumb?: Crumb[]
  className?: string
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page font-semibold leading-tight tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-body text-ink-500">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
