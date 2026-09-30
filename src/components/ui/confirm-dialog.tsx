import { ReactNode, useEffect } from 'react'
import { Card, CardBody } from './card'
import { Button } from './button'

// Shared confirmation modal for important / irreversible actions. Rendered inline
// (fixed overlay) so callers just hold an `open` flag.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  tone = 'danger',
  busy = false,
  size = 'sm',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  size?: 'sm' | 'lg'
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <Card className={size === 'lg' ? 'my-auto w-full max-w-2xl' : 'w-full max-w-sm'}>
        <CardBody className="space-y-4">
          <h2 id="confirm-dialog-title" className="text-title font-semibold">{title}</h2>
          <div className="text-body leading-relaxed text-ink-500">{message}</div>
          <div className="flex justify-end gap-2 border-t border-card-border pt-4">
            <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
