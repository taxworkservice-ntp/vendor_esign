import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, Plus, Search } from 'lucide-react'
import { useAdminTenants } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Input } from '../../components/ui/input'
import { FilterChip } from '../../components/ui/filter-chip'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { TableSkeleton } from '../../components/ui/table-skeleton'

const FILTERS = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ใช้งาน' },
  { v: 'suspended', th: 'ระงับ' },
]

const thCls = 'px-4 py-3 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

export function ClientsList() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const { data, isLoading } = useAdminTenants(q, status)
  const nav = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="ลูกค้า"
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
              <FilterChip key={f.v} active={status === f.v} onClick={() => setStatus(f.v)} className="h-9 px-3.5">
                {f.th}
              </FilterChip>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-body">
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th className={thCls}>ลูกค้า</th>
                <th className={thCls}>ชุดเลขที่</th>
                <th className={`${thCls} text-right`}>ธุรกรรม</th>
                <th className={`${thCls} text-right`}>ใบเสร็จ</th>
                <th className={`${thCls} text-right`}>ผู้ใช้</th>
                <th className={thCls}>สถานะ</th>
                <th className={`${thCls} w-10`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableSkeleton rows={5} cols={7} />}
              {!isLoading && data?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => nav(`/admin/clients/${t.id}`)}
                  className="cursor-pointer border-b border-card-border transition last:border-0 hover:bg-ink-50 focus-within:bg-ink-50"
                >
                  <td className="px-4 py-3.5">
                    <Link to={`/admin/clients/${t.id}`} className="font-semibold leading-snug hover:underline">{t.displayName}</Link>
                    <p className="mt-0.5 font-mono text-body text-ink-500">{t.clientCode}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-body">
                    {t.clientCode}-R-{t.beYear}-
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.txns}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.receipts}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{t.users}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold ${
                      t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}
                    </span>
                  </td>
                  <td className="px-2 py-3.5 text-ink-400"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 && !isLoading && (
          <EmptyState
            icon={Building2}
            title="ยังไม่มีลูกค้า"
            description="โปรดเปลี่ยนตัวกรอง หรือเพิ่มลูกค้าใหม่"
            action={
              <Link to="/admin/clients/new">
                <Button><Plus size={17} /> เพิ่มลูกค้า</Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  )
}
