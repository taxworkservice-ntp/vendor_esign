import { cn } from '../../lib/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Spinner } from './spinner'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'soft-success' | 'soft-neutral'
    loading?: boolean
  }
>(({ className, variant = 'primary', loading = false, disabled, children, ...p }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cn(
      'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-5 text-body font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50',
      variant === 'primary' && 'bg-primary text-white hover:brightness-110',
      variant === 'secondary' && 'border border-card-border bg-white text-ink-900 hover:border-ink-300',
      variant === 'ghost' && 'text-ink-700 hover:bg-ink-100',
      variant === 'danger' && 'bg-danger text-white hover:opacity-90',
      // Tonal variants: soft tint + coloured text. Blue = start a flow,
      // green = finish it. Contrast is validated by the tokens.
      variant === 'soft' && 'bg-primary-soft text-primary-text hover:brightness-95',
      variant === 'soft-success' && 'bg-success-soft text-success hover:brightness-95',
      variant === 'soft-neutral' && 'bg-ink-100 text-ink-700 hover:brightness-95',
      className,
    )}
    {...p}
  >
    {loading && <Spinner />}
    {children}
  </button>
))
Button.displayName = 'Button'
