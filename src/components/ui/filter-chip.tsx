import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

// One chip/segmented control used everywhere on list pages (status, month,
// slip, presets) so sizes, radius and active/hover states stay consistent.
export function FilterChip({
  active,
  className,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-body font-semibold transition',
        active ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-300/50',
        className,
      )}
      {...p}
    >
      {children}
    </button>
  )
}
