import { cn } from '../../lib/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...p }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 text-body font-semibold transition active:scale-[0.99] disabled:opacity-50',
        variant === 'primary' && 'bg-ink-900 text-white hover:bg-ink-700',
        variant === 'secondary' && 'bg-white text-ink-900 border border-card-border hover:border-ink-300',
        variant === 'ghost' && 'text-ink-700 hover:bg-ink-100',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
      {...p}
    />
  ),
)
Button.displayName = 'Button'
