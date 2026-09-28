import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
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

const thCls = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500'

export function TransactionList() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const { data, isLoading } = useTransactions(q, status)
  const nav = useNavigate()

  const sumGross = (data ?? []).reduce((s, t) => s + t.grossAmount, 0)
  const sumNet = (data ?? []).reduce((s, t) => s + t.netAmount, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="ธุรกรรมผู้ขาย"
        sub="สร้างรายการ · ส่งลิงก์ LINE · ติดตามสถานะจนออกใบเสร็จ"
        actions={
          <Link to="/transactions/new">
            <Button>
              <Plus size={17} /> สร้างรายการใหม่
            </Button>
          </Link>
        }
      />

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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className={thCls}>รายการ</th>
                <th className={thCls}>วันที่โอน</th>
                <th className={thCls}>สลิป</th>
                <th className={`${thCls} text-right`}>Gross</th>
                <th className={`${thCls} text-right`}>WHT</th>
                <th className={`${thCls} text-right`}>สุทธิ</th>
                <th className={thCls}>สถานะ</th>
                <th className={`${thCls} w-10`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => nav(`/transactions/${t.id}`)}
                  className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-bold leading-snug">{t.description}</p>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      <span className="font-mono">{t.id}</span> · {t.vendor.name}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">{fmtDateTH(t.transferDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13px]">{t.slipReference || <span className="font-sans text-ink-400">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">฿{fmtTHB(t.grossAmount)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-ink-500">
                    {t.whtRate}% · ฿{fmtTHB(t.whtAmount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={t.status} /></td>
                  <td className="px-2 py-3.5 text-ink-400"><ChevronLeft size={16} className="rotate-180" /></td>
                </tr>
              ))}
            </tbody>
            {(data?.length ?? 0) > 0 && (
              <tfoot>
                <tr className="bg-slate-50/80 font-bold">
                  <td className="px-4 py-3" colSpan={3}>รวม {data?.length} รายการ</td>
                  <td className="px-4 py-3 text-right tabular-nums">฿{fmtTHB(sumGross)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">฿{fmtTHB(sumNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {isLoading && <p className="px-4 py-6 text-sm text-ink-500">กำลังโหลด…</p>}
        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">ยังไม่มีรายการในช่วงนี้</p>
            <p className="mt-1 text-sm text-ink-500">ลองเปลี่ยนตัวกรอง หรือสร้างรายการใหม่</p>
          </div>
        )}
      </Card>
    </div>
  )
}
