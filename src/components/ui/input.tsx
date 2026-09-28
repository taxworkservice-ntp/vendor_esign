import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

export const inputCls =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10 placeholder:text-ink-400'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputCls, className)} {...p} />
))
Input.displayName = 'Input'

export function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-sm font-semibold text-ink-900">{children}</span>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
    </div>
  )
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1.5 text-[13px] font-medium text-red-600">{msg}</p>
}
