import { useTransactions } from '../hooks/useTransactions'
import { computeMetrics } from '../lib/receipt'
import { Card, CardBody } from '../components/ui/card'

export function MetricsPage() {
  const { data } = useTransactions('', 'all')
  const m = computeMetrics(data ?? [])
  const cards: [string, string][] = [
    ['สร้างรายการ', String(m.created)],
    ['เปิดลิงก์', String(m.linksOpened)],
    ['เซ็นแล้ว', String(m.signed)],
    ['หมดอายุ', String(m.expired)],
    ['มัธยฐาน ชม. ส่งลิงก์→เซ็น', m.medianHoursToSign === null ? '—' : m.medianHoursToSign.toFixed(1)],
  ]
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pilot metrics</h1>
        <p className="mt-1 text-sm text-ink-500">สำหรับเจ้าของ — คำนวณจากข้อมูล mock ในเครื่อง (backend จริงจะ aggregate จาก audit_events)</p>
      </div>
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
