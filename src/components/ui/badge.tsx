import type { TxnStatus } from '../../lib/types'
import { cn } from '../../lib/cn'

const MAP: Record<TxnStatus, { th: string; cls: string }> = {
  draft: { th: 'ฉบับร่าง', cls: 'bg-ink-100 text-ink-700' },
  sent: { th: 'ส่งลิงก์แล้ว', cls: 'bg-primary-soft text-primary-text' },
  opened: { th: 'เปิดลิงก์แล้ว', cls: 'bg-primary-soft text-primary-text' },
  signed: { th: 'ลงนามแล้ว', cls: 'bg-success-soft text-success' },
  // The one status drawn as a solid fill: "ออกใบเสร็จแล้ว" is the terminal state of
  // the receipt lifecycle, so it is the one worth a solid block. `success-fill` is
  // a lighter green than `success` (5.37:1 with white, versus 9.38:1) so the chip
  // no longer reads as near-black — but it stays a fill, keeping it distinct
  // from `signed` above it, which is a soft tint.
  issued: { th: 'ออกใบเสร็จแล้ว', cls: 'bg-success-fill text-white' },
  expired: { th: 'หมดอายุ', cls: 'bg-warning-soft text-warning' },
  cancelled: { th: 'เพิกถอนลิงก์', cls: 'bg-ink-100 text-ink-500' },
  void: { th: 'ยกเลิกเอกสาร', cls: 'bg-danger-soft text-danger' },
}

export function StatusBadge({ status }: { status: TxnStatus }) {
  const m = MAP[status]
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold', m.cls)}>{m.th}</span>
}
