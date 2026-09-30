import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="px-4 py-14 text-center">
      {Icon && (
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-ink-100 text-ink-400">
          <Icon size={20} />
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-body text-ink-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
