import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

// One chip/segmented control used everywhere on list pages (status, month,
// slip, presets) so sizes, radius and active/hover states stay consistent.
//
// The active state is the accent, not near-black. This chip used to fill with
// ink-900, which put a heavy black block on every list page that has a status
// filter — and made "selected" compete with the primary buttons, which are the
// only thing in the app that should look actionable. A tinted fill plus a border
// of the same hue reads as chosen without adding another dark mass.
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
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-body font-medium transition',
        active
          ? 'border-primary/30 bg-primary-soft text-primary-text'
          : 'border-transparent bg-ink-100 text-ink-700 hover:bg-ink-300/50',
        className,
      )}
      {...p}
    >
      {children}
    </button>
  )
}
