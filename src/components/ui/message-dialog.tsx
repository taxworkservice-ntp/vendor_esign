import { useEffect } from 'react'
import { Copy } from 'lucide-react'
import { Card, CardBody } from './card'
import { Button } from './button'

// Read-only message preview modal: shows a pre-built text (e.g. the
// first-login notice for a new user) so the admin can eyeball it, then copy.
// Rendered inline (fixed overlay) so callers just hold an `open` flag.
export function MessageDialog({
  open,
  title,
  message,
  copied,
  onCopy,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-lg">
        <CardBody className="space-y-4">
          <h2 id="message-dialog-title" className="text-title font-semibold">{title}</h2>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-control bg-ink-50 p-3 text-body leading-relaxed">
            {message}
          </pre>
          <div className="flex justify-end gap-2 border-t border-card-border pt-4">
            <Button variant="ghost" onClick={onClose}>ปิด</Button>
            <Button variant="primary" onClick={onCopy}>
              <Copy size={15} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
