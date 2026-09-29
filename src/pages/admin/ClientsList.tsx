import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { useAdminTenants } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'

const FILTERS = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ใช้งาน' },
  { v: 'suspended', th: 'ระงับ' },
]

const thCls = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500'

export function ClientsList() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const { data, isLoading } = useAdminTenants(q, status)
  const nav = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="ลูกค้า (Clients)"
        sub="สมัครลูกค้าใหม่ · ระงับ/เปิดใช้งาน · จัดการผู้ใช้แยกตามลูกค้า"
        actions={
          <Link to="/admin/clients/new">
            <Button>
              <Plus size={17} /> เพิ่มลูกค้า
            </Button>
          </Link>
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input className="pl-10" placeholder="ค้นหารหัส / ชื่อลูกค้า…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <th className={thCls}>ลูกค้า</th>
                <th className={thCls}>Series</th>
                <th className={`${thCls} text-right`}>ธุรกรรม</th>
                <th className={`${thCls} text-right`}>ใบเสร็จ</th>
                <th className={`${thCls} text-right`}>ผู้ใช้</th>
                <th className={thCls}>สถานะ</th>
                <th className={`${thCls} w-10`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => nav(`/admin/clients/${t.id}`)}
                  className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-bold leading-snug">{t.displayName}</p>
                    <p className="mt-0.5 font-mono text-[13px] text-ink-500">{t.clientCode}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13px]">
                    {t.clientCode}-R-{t.beYear}-
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.txns}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.receipts}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.users}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}
                    </span>
                  </td>
                  <td className="px-2 py-3.5 text-ink-400"><ChevronLeft size={16} className="rotate-180" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <p className="px-4 py-6 text-sm text-ink-500">กำลังโหลด…</p>}
        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">ยังไม่มีลูกค้าในช่วงนี้</p>
            <p className="mt-1 text-sm text-ink-500">ลองเปลี่ยนตัวกรอง หรือเพิ่มลูกค้าใหม่</p>
          </div>
        )}
      </Card>
    </div>
  )
}
