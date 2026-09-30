import { InputHTMLAttributes, forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import { inputCls, inputErrorCls } from './input'

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...p }, ref) => {
    const [show, setShow] = useState(false)
    return (
      <div className="relative">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={cn(inputCls, 'pr-11', invalid && inputErrorCls, className)}
          {...p}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
