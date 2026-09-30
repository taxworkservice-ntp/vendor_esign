import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

export const inputCls =
  'h-11 w-full rounded-control border border-card-border bg-white px-3.5 text-body outline-none transition placeholder:text-ink-400 focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400'

export const inputErrorCls = 'border-danger focus:border-danger focus:ring-danger/15'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...p }, ref) => (
    <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputCls, invalid && inputErrorCls, className)} {...p} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...p }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(inputCls, 'h-auto py-2.5 leading-relaxed', invalid && inputErrorCls, className)}
      {...p}
    />
  ),
)
Textarea.displayName = 'Textarea'

export function Label({ children, hint, required }: { children: string; hint?: string; required?: boolean }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-label font-medium text-ink-600">
        {children}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
      </span>
      {hint && <span className="text-label text-ink-500">{hint}</span>}
    </div>
  )
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1.5 text-label font-medium text-danger">{msg}</p>
}
