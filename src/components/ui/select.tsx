import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

// Native <select> with a consistent custom chevron (see `.ui-select` in
// index.css) so it matches the text inputs instead of the OS control.
export const selectCls =
  'ui-select h-11 w-full rounded-control border border-card-border bg-white pl-3.5 text-body outline-none transition focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} className={cn(selectCls, className)} {...p}>
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
