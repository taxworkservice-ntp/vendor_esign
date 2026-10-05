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
import { Row, Td, Th, tableCls } from '../../components/ui/data-table'
import { cn } from '../../lib/cn'

const FILTERS = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ใช้งาน' },
  { v: 'suspended', th: 'ระงับ' },
]

export function ClientsList() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const { data, isLoading } = useAdminTenants(q, status)
  const nav = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="ลูกค้า (เวิร์กสเปซ)"
        sub="สมัครลูกค้าใหม่ · ระงับ/เปิดใช้งาน · จัดการผู้ใช้ · ดูในนามลูกค้า"
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
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input className="pl-10" placeholder="ค้นหารหัส / ชื่อลูกค้า…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
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
          <table className={cn(tableCls, 'min-w-[900px]')}>
            <thead>
              <tr>
                <Th>ลูกค้า</Th>
                <Th>ชุดเลขที่</Th>
                <Th align="right">ธุรกรรม</Th>
                <Th align="right">ใบเสร็จ</Th>
                <Th align="right">ผู้ใช้</Th>
                <Th>สถานะ</Th>
                <Th className="w-10">
                  <span className="sr-only">เปิด</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : (
                (data ?? []).map((t) => (
                  <Row key={t.id} className="cursor-pointer" >
                    <Td onClick={() => nav(`/admin/clients/${t.id}`)}>
                      <Link to={`/admin/clients/${t.id}`} className="font-semibold leading-snug hover:underline">
                        {t.displayName}
                      </Link>
                      <p className="mt-0.5 font-mono text-body text-ink-500">{t.clientCode}</p>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-body" onClick={() => nav(`/admin/clients/${t.id}`)}>
                      {t.clientCode}-R-{t.beYear}-
                    </Td>
                    <Td align="right" className="tabular-nums" onClick={() => nav(`/admin/clients/${t.id}`)}>{t.txns}</Td>
                    <Td align="right" className="tabular-nums" onClick={() => nav(`/admin/clients/${t.id}`)}>{t.receipts}</Td>
                    <Td align="right" className="tabular-nums" onClick={() => nav(`/admin/clients/${t.id}`)}>{t.users}</Td>
                    <Td onClick={() => nav(`/admin/clients/${t.id}`)}>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold',
                          t.status === 'active' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                        )}
                      >
                        {t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}
                      </span>
                    </Td>
                    <Td className="px-2 text-ink-400" onClick={() => nav(`/admin/clients/${t.id}`)}>
                      <ChevronRight size={16} aria-hidden />
                    </Td>
                  </Row>
                ))
              )}
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
                <Button>
                  <Plus size={17} /> เพิ่มลูกค้า
                </Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  )
}
