import { cn } from '../../lib/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Spinner } from './spinner'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }
>(({ className, variant = 'primary', loading = false, disabled, children, ...p }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cn(
      'inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 text-body font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50',
      variant === 'primary' && 'bg-primary-deep text-white hover:bg-primary-deeper',
      variant === 'secondary' && 'border border-card-border bg-white text-ink-900 hover:border-ink-300',
      variant === 'ghost' && 'text-ink-700 hover:bg-ink-100',
      variant === 'danger' && 'bg-danger text-white hover:opacity-90',
      className,
    )}
    {...p}
  >
    {loading && <Spinner />}
    {children}
  </button>
))
Button.displayName = 'Button'
