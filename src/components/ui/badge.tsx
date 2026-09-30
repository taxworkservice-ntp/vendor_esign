import type { TxnStatus } from '../../lib/types'
import { cn } from '../../lib/cn'

const MAP: Record<TxnStatus, { th: string; cls: string }> = {
  draft: { th: 'ฉบับร่าง', cls: 'bg-ink-100 text-ink-700' },
  sent: { th: 'ส่งลิงก์แล้ว', cls: 'bg-primary-soft text-primary-deep' },
  opened: { th: 'เปิดลิงก์แล้ว', cls: 'bg-primary-soft text-primary-deep' },
  signed: { th: 'ลงนามแล้ว', cls: 'bg-accent-teal/10 text-accent-teal' },
  issued: { th: 'ออกใบเสร็จแล้ว', cls: 'bg-success-soft text-success' },
  expired: { th: 'หมดอายุ', cls: 'bg-warning-soft text-warning' },
  cancelled: { th: 'เพิกถอนลิงก์', cls: 'bg-ink-100 text-ink-500' },
  void: { th: 'ยกเลิกเอกสาร', cls: 'bg-danger-soft text-danger' },
}

export function StatusBadge({ status }: { status: TxnStatus }) {
  const m = MAP[status]
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold', m.cls)}>{m.th}</span>
}
