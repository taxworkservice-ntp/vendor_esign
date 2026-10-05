import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Copy, FileCheck2, FileText, PenLine, Send, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PaymentTransaction, TxnStatus } from '../../lib/types'
import { Button } from '../ui/button'
import { cn } from '../../lib/cn'

// The "where am I / what do I do now" band for a transaction.
//
// Every status has exactly one job, and this band is the only place that owns
// the primary action for it. The rest of the page keeps secondary actions, so
// the operator is never choosing between two full-weight buttons.

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
type Action = 'send' | 'copy' | 'issue' | 'open'

interface Stage {
  tone: Tone
  icon: LucideIcon
  title: string
  body: string
  /** Number of completed steps (0–4) for the stepper. */
  reached: number
  action?: Action
  actionLabel?: string
  halted?: boolean
}

const STEPS = ['สร้าง', 'ส่งลิงก์', 'ลงนาม', 'ออกใบเสร็จ'] as const

const TONE: Record<Tone, { box: string; icon: string; title: string }> = {
  neutral: { box: 'border-card-border bg-ink-50', icon: 'bg-ink-100 text-ink-600', title: 'text-ink-900' },
  info: { box: 'border-primary/30 bg-primary-soft', icon: 'bg-white text-primary-text', title: 'text-primary-text' },
  success: { box: 'border-success/30 bg-success-soft', icon: 'bg-white text-success', title: 'text-success' },
  warning: { box: 'border-warning/30 bg-warning-soft', icon: 'bg-white text-warning', title: 'text-warning' },
  danger: { box: 'border-danger/30 bg-danger-soft', icon: 'bg-white text-danger', title: 'text-danger' },
}

function stageFor(status: TxnStatus, receiptNumber?: string): Stage {
  switch (status) {
    case 'draft':
      return { tone: 'neutral', icon: Send, title: 'ยังไม่ได้ส่งลิงก์ให้ผู้ขาย', body: 'สร้างลิงก์เพื่อให้ผู้ขายยืนยันรับเงินและลงนามมอบอำนาจ', reached: 1, action: 'send', actionLabel: 'สร้างลิงก์ให้ผู้ขาย' }
    case 'sent':
      return { tone: 'info', icon: Send, title: 'ส่งลิงก์แล้ว — รอผู้ขายลงนาม', body: 'ลิงก์ใช้ได้จนกว่าผู้ขายจะลงนามหรือหมดอายุ', reached: 2, action: 'copy', actionLabel: 'คัดลอกลิงก์' }
    case 'opened':
      return { tone: 'info', icon: PenLine, title: 'ผู้ขายเปิดลิงก์แล้ว — รอลงนาม', body: 'เมื่อผู้ขายลงนามแล้ว จะสามารถออกใบเสร็จได้', reached: 2, action: 'copy', actionLabel: 'คัดลอกลิงก์' }
    case 'signed':
      return { tone: 'success', icon: FileCheck2, title: 'ผู้ขายลงนามแล้ว — พร้อมออกใบเสร็จ', body: 'ออกเลขที่ใบเสร็จและสร้างเอกสารสำหรับรายการนี้ (ดำเนินการแล้วแก้ไขไม่ได้)', reached: 3, action: 'issue', actionLabel: 'ออกใบเสร็จและออกเลขที่' }
    case 'issued':
      return { tone: 'success', icon: FileText, title: receiptNumber ? `ออกใบเสร็จแล้ว · ${receiptNumber}` : 'ออกใบเสร็จแล้ว', body: 'เปิดหรือดาวน์โหลดใบเสร็จเพื่อส่งมอบให้ผู้ขาย', reached: 4, action: 'open', actionLabel: 'เปิดใบเสร็จ · ดาวน์โหลด PDF' }
    case 'expired':
      return { tone: 'warning', icon: AlertTriangle, title: 'ลิงก์หมดอายุ', body: 'สร้างลิงก์ใหม่เพื่อให้ผู้ขายลงนามอีกครั้ง', reached: 1, action: 'send', actionLabel: 'สร้างลิงก์ใหม่' }
    case 'cancelled':
      return { tone: 'neutral', icon: ShieldAlert, title: 'ลิงก์ถูกเพิกถอน', body: 'สร้างลิงก์ใหม่หากต้องการส่งให้ผู้ขายอีกครั้ง', reached: 1, action: 'send', actionLabel: 'สร้างลิงก์ใหม่' }
    case 'void':
      return { tone: 'danger', icon: AlertTriangle, title: 'เอกสารถูกยกเลิก', body: 'เลขที่เดิมคงไว้ และออกเลขที่ใหม่แทนเมื่อสร้างรายการใหม่', reached: 4, halted: true }
    default:
      return { tone: 'neutral', icon: Send, title: 'รายการ', body: '', reached: 1, action: 'send', actionLabel: 'สร้างลิงก์ให้ผู้ขาย' }
  }
}

function Stepper({ reached, halted, tone }: { reached: number; halted?: boolean; tone: Tone }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="ขั้นตอนเอกสาร">
      {STEPS.map((label, i) => {
        const done = i < reached
        const current = i === reached
        const currentTone = halted && current ? (tone === 'danger' ? 'bg-danger text-white' : 'bg-warning text-white') : 'bg-primary text-white'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full text-label font-semibold tabular-nums',
                done ? 'bg-success-soft text-success' : current ? currentTone : 'bg-ink-100 text-ink-400',
              )}
              aria-hidden
            >
              {done ? <CheckCircle2 size={14} /> : i + 1}
            </span>
            <span className={cn('text-label', current ? 'font-semibold text-ink-900' : 'text-ink-500')}>{label}</span>
            {i < STEPS.length - 1 && <span className={cn('h-px w-5 sm:w-8', done ? 'bg-success/40' : 'bg-ink-100')} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

export function NextActionBand({
  t,
  copiedLink,
  onSend,
  onIssue,
  onCopyLink,
  receiptHref,
}: {
  t: PaymentTransaction
  copiedLink: boolean
  onSend: () => void
  onIssue: () => void
  onCopyLink: () => void
  receiptHref: string
}) {
  const stage = stageFor(t.status, t.receiptNumber)
  const tone = TONE[stage.tone]
  const Icon = stage.icon

  return (
    <section className={cn('rounded-card border p-4 sm:p-5', tone.box)} aria-label="ขั้นตอนถัดไป">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-control', tone.icon)}>
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn('text-title font-semibold', tone.title)}>{stage.title}</h2>
          <p className="mt-0.5 text-body text-ink-600">{stage.body}</p>
        </div>
        {stage.action && (
          <div className="shrink-0">
            {stage.action === 'issue' && <Button onClick={onIssue}>{stage.actionLabel}</Button>}
            {stage.action === 'send' && <Button onClick={onSend}>{stage.actionLabel}</Button>}
            {stage.action === 'copy' && (
              <Button variant="secondary" onClick={onCopyLink}>
                <Copy size={15} aria-hidden /> {copiedLink ? 'คัดลอกลิงก์แล้ว' : stage.actionLabel}
              </Button>
            )}
            {stage.action === 'open' && (
              <Link to={receiptHref}>
                <Button>{stage.actionLabel}</Button>
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-black/5 pt-3">
        <Stepper reached={stage.reached} halted={stage.halted} tone={stage.tone} />
      </div>
    </section>
  )
}
