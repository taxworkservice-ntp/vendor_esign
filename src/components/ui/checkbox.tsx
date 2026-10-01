import { cn } from '../../lib/cn'

/**
 * Accessible checkbox. A real <input type="checkbox"> under a styled box, so
 * native keyboard behaviour (space to toggle), form semantics and the
 * indeterminate state all work — none of which a div with onClick would.
 */
export function Checkbox({
  className,
  label,
  indeterminate,
  hideLabel,
  ...p
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  indeterminate?: boolean
  /** Keep the label for screen readers but off-screen. */
  hideLabel?: boolean
}) {
  return (
    <label className={cn('inline-flex items-center gap-2', className)}>
      <input
        type="checkbox"
        aria-label={label}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate && !el.checked
        }}
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-ink-300 bg-white transition',
          'checked:border-ink-900 checked:bg-ink-900',
          'indeterminate:border-ink-900 indeterminate:bg-ink-900',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
        style={
          indeterminate
            ? {
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23fff' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M4 8h8'/%3E%3C/svg%3E\")",
                backgroundSize: '100%',
              }
            : undefined
        }
        {...p}
      />
      {label && <span className={hideLabel ? 'sr-only' : 'text-body'}>{label}</span>}
    </label>
  )
}
