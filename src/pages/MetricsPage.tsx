import { useMemo } from 'react'
import { Clock, FilePlus2, MousePointerClick, PenLine, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAllTransactions } from '../hooks/useTransactions'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { emptyFilters } from '../lib/txn-filters'
import { formatMonthTH } from '../lib/global-month'
import { computeMetrics } from '../lib/receipt'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { ErrorState } from '../components/ui/error-state'

interface Stat {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
}

export function MetricsPage() {
  // Global period scopes the overview by transferDate (transaction period).
  const { month } = useGlobalMonth()
  const filters = useMemo(() => ({ ...emptyFilters(), month }), [month])
  // Metrics count and average over the whole period, so this needs every row in
  // the month rather than one page of the list.
  const { data, isLoading, isError, error, refetch } = useAllTransactions(filters)
  const m = computeMetrics(data ?? [])
  const stats: Stat[] = [
    { label: 'สร้างรายการ', value: String(m.created), icon: FilePlus2 },
    { label: 'ผู้ขายเปิดลิงก์', value: String(m.linksOpened), icon: MousePointerClick },
    { label: 'ลงนามแล้ว', value: String(m.signed), icon: PenLine },
    { label: 'หมดอายุ', value: String(m.expired), icon: Clock },
    {
      label: 'ค่ามัธยฐานจากส่งลิงก์ถึงลงนาม',
      value: m.medianHoursToSign === null ? '—' : m.medianHoursToSign.toFixed(1),
      icon: Timer,
      hint: 'ชั่วโมง',
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="ภาพรวม"
        sub={`สรุปจำนวนและระยะเวลาของรายการในระบบ สำหรับผู้ประกอบการ · ${month ? `รอบ ${formatMonthTH(month)} ตามวันที่โอน` : 'ทั้งหมด · ไม่จำกัดเดือน'}`}
      />
      {/* An error here would otherwise render five confident zeros — a
          "nothing happened this month" summary built from a failed request. */}
      {isError && (
        <Card>
          <ErrorState
            title="โหลดภาพรวมไม่สำเร็จ"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        </Card>
      )}
      {isLoading && (
        <p className="rounded-control border border-card-border bg-white px-4 py-3 text-body text-ink-500">
          กำลังโหลดภาพรวม…
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <Card key={label}>
            <CardBody className="space-y-3">
              <span className="grid h-9 w-9 place-items-center rounded-control bg-ink-100 text-ink-600">
                <Icon size={17} />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {value}
                  {hint && <span className="ml-1 text-body font-normal text-ink-400">{hint}</span>}
                </p>
                <p className="mt-0.5 text-label text-ink-500">{label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
