import { useEffect, useRef, useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Card, CardBody } from './card'
import { Button } from './button'
import { useToast } from './toast'
import { buildFirstLoginMessage } from '../../lib/admin-invite-message'
import { cn } from '../../lib/cn'

// One-time reveal of a temporary password, used by both admin surfaces that can
// mint one (create user, reset password).
//
// The credential must not be lost by accident: this dialog cannot be dismissed
// by backdrop click or Escape, and its close button stays disabled until the
// admin has copied something. State lives here rather than in the page so the
// create and reset flows cannot drift apart.

export function TempPasswordDialog({
  open,
  email,
  tempPassword,
  loginUrl,
  onClose,
}: {
  open: boolean
  email: string
  tempPassword: string
  /** Login URL for the pasted invite. Defaults to `<origin>/login`. */
  loginUrl?: string
  onClose: () => void
}) {
  const toast = useToast()
  const [hasCopied, setHasCopied] = useState(false)
  const copyPwRef = useRef<HTMLButtonElement>(null)

  // Fresh gate every time a (new) credential is revealed.
  useEffect(() => {
    if (!open) return
    setHasCopied(false)
    copyPwRef.current?.focus()
  }, [open, tempPassword])

  if (!open) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = loginUrl ?? `${origin}/login`
  const message = buildFirstLoginMessage({ loginUrl: url, email, tempPassword })

  const copy = async (text: string, done: string) => {
    // Unlock on any attempt so a blocked clipboard can never trap the admin.
    setHasCopied(true)
    try {
      if (!navigator?.clipboard) throw new Error('clipboard-unavailable')
      await navigator.clipboard.writeText(text)
      toast.show(done)
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="temp-password-title"
    >
      <Card className="my-auto w-full max-w-lg">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-warning-soft text-warning">
              <KeyRound size={17} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="temp-password-title" className="text-title font-semibold">ตั้งรหัสผ่านชั่วคราวให้แล้ว</h2>
              <p className="truncate text-body text-ink-500">{email}</p>
            </div>
          </div>

          <div className="rounded-control bg-warning-soft p-3">
            <p className="text-label font-semibold text-warning">รหัสผ่านชั่วคราว (แสดงเพียงครั้งเดียว)</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all break-all font-mono text-lg font-semibold tracking-wide">{tempPassword}</code>
              <Button
                ref={copyPwRef}
                variant="secondary"
                className="h-9 shrink-0 px-3 text-body"
                onClick={() => void copy(tempPassword, 'คัดลอกรหัสผ่านแล้ว')}
              >
                <Copy size={14} /> คัดลอกรหัสผ่าน
              </Button>
            </div>
            <p className="mt-1.5 text-label text-warning">หมดอายุใน 7 วัน · ระบบบังคับให้เปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งแรก · จัดเก็บเฉพาะค่าแฮช scrypt</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-label font-semibold text-ink-600">ข้อความแจ้งผู้ใช้ (คัดลอกไปวางได้เลย)</p>
              <Button
                variant="ghost"
                className="h-8 px-2 text-label"
                onClick={() => void copy(message, 'คัดลอกข้อความแจ้งผู้ใช้แล้ว')}
              >
                <Copy size={14} /> คัดลอกข้อความ
              </Button>
            </div>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-control border border-card-border bg-ink-50/80 p-3 text-body leading-relaxed">{message}</pre>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-card-border pt-4">
            <p className={cn('text-label', hasCopied ? 'text-ink-500' : 'text-warning')}>
              {hasCopied ? 'คัดลอกแล้ว — เก็บรหัสให้ปลอดภัยก่อนปิด' : 'กรุณาคัดลอกรหัสก่อนปิด (จะไม่แสดงอีก)'}
            </p>
            <Button
              variant="primary"
              disabled={!hasCopied}
              onClick={onClose}
            >
              {hasCopied && <Check size={15} aria-hidden />} เสร็จสิ้น
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
