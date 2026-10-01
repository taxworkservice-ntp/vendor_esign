import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'

// Minimal toast host for transient confirmations ("คัดลอกแล้ว", "ส่งออกแล้ว").
//
// This replaces the per-component pattern of a `copied` boolean plus a bare
// setTimeout, which had two problems: the timer was never cleared on unmount,
// and the confirmation was invisible to a screen reader. Here the message is
// announced through a live region and the timer is owned centrally.

export type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void
}

const Ctx = createContext<ToastApi | null>(null)

const TONE: Record<ToastTone, { cls: string; Icon: typeof Check }> = {
  success: { cls: 'border-success/30 bg-success-soft text-success', Icon: Check },
  error: { cls: 'border-danger/30 bg-danger-soft text-danger', Icon: AlertTriangle },
  info: { cls: 'border-card-border bg-white text-ink-700', Icon: Info },
}

const LIFETIME = 2600

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<number[]>([])

  // Clear every pending dismissal on unmount so no state update lands after
  // the provider is gone.
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, message, tone }])
      const timer = window.setTimeout(() => dismiss(id), LIFETIME)
      timers.current.push(timer)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="no-print pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { cls, Icon } = TONE[t.tone]
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full items-center gap-2.5 rounded-control border px-3.5 py-2.5 text-body font-semibold shadow-overlay',
                cls,
              )}
            >
              <Icon size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="ปิดการแจ้งเตือน"
                className="shrink-0 rounded-control p-0.5 opacity-60 transition hover:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  // A no-op keeps components usable in isolation (tests, stories) rather than
  // forcing every caller to wrap in a provider.
  return v ?? { show: () => {} }
}
