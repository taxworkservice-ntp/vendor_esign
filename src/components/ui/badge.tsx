import type { TxnStatus } from '../../lib/types'
import { cn } from '../../lib/cn'

const MAP: Record<TxnStatus, { th: string; cls: string }> = {
  draft: { th: 'ฉบับร่าง', cls: 'bg-slate-100 text-slate-700' },
  sent: { th: 'ส่งลิงก์แล้ว', cls: 'bg-blue-50 text-blue-700' },
  opened: { th: 'เปิดแล้ว', cls: 'bg-indigo-50 text-indigo-700' },
  signed: { th: 'เซ็นแล้ว', cls: 'bg-violet-50 text-violet-700' },
  issued: { th: 'ออกใบเสร็จ', cls: 'bg-emerald-50 text-emerald-700' },
  expired: { th: 'หมดอายุ', cls: 'bg-amber-50 text-amber-700' },
  cancelled: { th: 'ยกเลิก', cls: 'bg-slate-100 text-slate-500' },
  void: { th: 'void', cls: 'bg-red-50 text-red-700' },
}

export function StatusBadge({ status }: { status: TxnStatus }) {
  const m = MAP[status]
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', m.cls)}>{m.th}</span>
}
