import { cn } from '../../lib/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...p }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50',
        variant === 'primary' && 'bg-ink-900 text-white hover:bg-ink-700 shadow-card',
        variant === 'secondary' && 'bg-white text-ink-900 border border-slate-200 hover:border-slate-300 shadow-card',
        variant === 'ghost' && 'text-ink-700 hover:bg-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...p}
    />
  ),
)
Button.displayName = 'Button'
