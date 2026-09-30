import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Search, Users } from 'lucide-react'
import { useVendors } from '../hooks/useVendors'
import { displayTaxId } from '../lib/vendors-mock'
import { vendorDisplayName } from '../lib/vendor-name'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { TableSkeleton } from '../components/ui/table-skeleton'

const thCls = 'px-4 py-3 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

export function VendorsList() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useVendors(q)
  const nav = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="ผู้ขาย"
        sub="ทะเบียนผู้ขายรายย่อย (ไม่จด VAT) — ใช้สำหรับออกใบเสร็จรับเงิน"
        actions={
          <Link to="/vendors/new">
            <Button>
              <Plus size={17} /> เพิ่มผู้ขาย
            </Button>
          </Link>
        }
      />

      <Card>
        <CardBody>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input className="pl-10" placeholder="ค้นหาชื่อ / ที่อยู่…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-body">
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th className={thCls}>ผู้ขาย</th>
                <th className={thCls}>เลขบัตรประชาชน</th>
                <th className={thCls}>LINE</th>
                <th className={`${thCls} w-10`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableSkeleton rows={5} cols={4} />}
              {!isLoading && data?.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => nav(`/vendors/${v.id}`)}
                  className="cursor-pointer border-b border-card-border transition last:border-0 hover:bg-ink-50 focus-within:bg-ink-50"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-label text-ink-400">#{String(v.vendorNo ?? 0).padStart(3, '0')}</span>
                      <Link to={`/vendors/${v.id}`} className="font-semibold leading-snug hover:underline">{vendorDisplayName(v.prefix, v.name)}</Link>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-body text-ink-500">{v.address}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-body">{displayTaxId(v)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-body">{v.lineUserId || '—'}</td>
                  <td className="px-2 py-3.5 text-ink-400"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 && !isLoading && (
          <EmptyState
            icon={Users}
            title="ยังไม่มีผู้ขาย"
            description="เพิ่มผู้ขายรายใหม่เพื่อเริ่มออกใบเสร็จรับเงิน"
            action={
              <Link to="/vendors/new">
                <Button><Plus size={17} /> เพิ่มผู้ขาย</Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  )
}
