import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { useVendors } from '../hooks/useVendors'
import { displayTaxId } from '../lib/vendors-mock'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'

const thCls = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500'

export function VendorsList() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useVendors(q)
  const nav = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        title="ผู้ขาย"
        sub="ทะเบียนผู้ขายรายย่อย (ไม่จด VAT) ของลูกค้านี้ — ออกใบเสร็จรับเงินได้"
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
          <table className="w-full min-w-[680px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className={thCls}>ผู้ขาย</th>
                <th className={thCls}>เลขบัตรประชาชน</th>
                <th className={thCls}>LINE</th>
                <th className={`${thCls} w-10`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => nav(`/vendors/${v.id}`)}
                  className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-bold leading-snug">{v.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-500">{v.address}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13px]">{displayTaxId(v)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13px]">{v.lineUserId || '—'}</td>
                  <td className="px-2 py-3.5 text-ink-400"><ChevronLeft size={16} className="rotate-180" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <p className="px-4 py-6 text-sm text-ink-500">กำลังโหลด…</p>}
        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">ยังไม่มีผู้ขาย</p>
            <p className="mt-1 text-sm text-ink-500">เพิ่มผู้ขายรายใหม่ได้เลย</p>
          </div>
        )}
      </Card>
    </div>
  )
}
