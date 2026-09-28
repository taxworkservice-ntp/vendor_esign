import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { fmtTHB, fmtDateTH } from '../lib/format'

const FILTERS = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'draft', th: 'ฉบับร่าง' },
  { v: 'sent', th: 'ส่งลิงก์แล้ว' },
  { v: 'issued', th: 'ออกใบเสร็จ' },
  { v: 'void', th: 'void' },
  { v: 'cancelled', th: 'ยกเลิก' },
]

export function TransactionList() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const { data, isLoading } = useTransactions(q, status)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ธุรกรรมผู้ขาย</h1>
          <p className="mt-1 text-sm text-ink-500">สร้างรายการ · ส่งลิงก์ LINE · ติดตามสถานะจนออกใบเสร็จ</p>
        </div>
        <Link to="/transactions/new">
          <Button>
            <Plus size={17} /> สร้างรายการใหม่
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input className="pl-10" placeholder="ค้นหาชื่อผู้ขาย / รายละเอียด / เลขรายการ…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                onClick={() => setStatus(f.v)}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                  status === f.v ? 'bg-ink-900 text-white' : 'bg-slate-100 text-ink-700 hover:bg-slate-200'
                }`}
              >
                {f.th}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {isLoading && <p className="text-sm text-ink-500">กำลังโหลด…</p>}

      <div className="grid gap-3">
        {data?.map((t) => (
          <Link key={t.id} to={`/transactions/${t.id}`}>
            <Card className="transition hover:-translate-y-[1px] hover:shadow-card">
              <CardBody className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink-500">{t.id}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 truncate text-[16px] font-bold">{t.description}</p>
                  <p className="text-sm text-ink-500">
                    {t.vendor.name} · โอน {fmtDateTH(t.transferDate)} · สลิป {t.slipReference}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</p>
                  <p className="text-xs text-ink-500 tabular-nums">
                    gross ฿{fmtTHB(t.grossAmount)} · WHT {t.whtRate}%
                  </p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
        {data?.length === 0 && (
          <Card>
            <CardBody className="py-12 text-center">
              <p className="font-semibold">ยังไม่มีรายการในช่วงนี้</p>
              <p className="mt-1 text-sm text-ink-500">ลองเปลี่ยนตัวกรอง หรือสร้างรายการใหม่</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}
