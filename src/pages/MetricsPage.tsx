import { useTransactions } from '../hooks/useTransactions'
import { computeMetrics } from '../lib/receipt'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'

export function MetricsPage() {
  const { data } = useTransactions()
  const m = computeMetrics(data ?? [])
  const cards: [string, string][] = [
    ['สร้างรายการ', String(m.created)],
    ['ผู้ขายเปิดลิงก์', String(m.linksOpened)],
    ['ลงนามแล้ว', String(m.signed)],
    ['หมดอายุ', String(m.expired)],
    ['มัธยฐานเวลาส่งลิงก์→ลงนาม (ชม.)', m.medianHoursToSign === null ? '—' : m.medianHoursToSign.toFixed(1)],
  ]
  return (
    <div className="space-y-5">
      <PageHeader
        title="ภาพรวม"
        sub="สรุปสำหรับผู้ประกอบการ — จำนวนและระยะเวลาของรายการในระบบ"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(([label, v]) => (
          <Card key={label}><CardBody className="text-center">
            <p className="text-2xl font-bold tabular-nums">{v}</p>
            <p className="mt-1 text-xs text-ink-500">{label}</p>
          </CardBody></Card>
        ))}
      </div>
    </div>
  )
}
