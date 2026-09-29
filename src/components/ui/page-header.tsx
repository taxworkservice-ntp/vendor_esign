import { ReactNode } from 'react'

// Single page-header pattern app-wide: title + muted subtitle + right actions.
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-page font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-body text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
