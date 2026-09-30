import { Link } from 'react-router-dom'
import { Download, ReceiptText } from 'lucide-react'
import { useWht } from '../hooks/useWht'
import { fmtWhtDate, fmtWhtNum } from '../lib/wht'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'

const thCls = 'px-3 py-2 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

export function WhtList() {
  const { data } = useWht()
  const records = data?.records ?? []
  const vendors = data?.vendors ?? []
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? '—'
  const ids = (list: string[]) => list.join(',')

  return (
    <div className="space-y-5">
      <PageHeader title="ภาษีหัก ณ ที่จ่าย (WHT)" sub="หนังสือรับรองการหักภาษี ณ ที่จ่าย — แบบฟอร์มราชการ (แบบ ภ.ง.ด.)" />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-body">
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th className={thCls}>เลขที่ใบรับรอง</th>
                <th className={thCls}>ผู้ถูกหักภาษี</th>
                <th className={thCls}>แบบ</th>
                <th className={thCls}>วันที่จ่าย</th>
                <th className={`${thCls} text-right`}>จำนวนเงิน</th>
                <th className={`${thCls} text-right`}>ภาษีหัก</th>
                <th className={`${thCls} w-40 text-right`}>ดาวน์โหลด</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-card-border last:border-0 hover:bg-ink-50">
                  <td className="px-3 py-2.5 font-mono text-body">{r.certificateNo ?? '—'}</td>
                  <td className="px-3 py-2.5 font-semibold">{vendorName(r.vendorId)}</td>
                  <td className="px-3 py-2.5 font-mono text-body uppercase">{r.formType}</td>
                  <td className="px-3 py-2.5">{fmtWhtDate(r.issueDate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtWhtNum(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtWhtNum(r.whtAmount)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end">
                      <Link to={`/wht/print?ids=${r.id}&layout=pnd`} target="_blank">
                        <Button variant="secondary" className="h-9 px-3 text-body"><Download size={14} /> ดาวน์โหลด</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length === 0 && (
          <EmptyState
            icon={ReceiptText}
            title="ยังไม่มีรายการภาษีหัก ณ ที่จ่าย"
            description="รายการจะปรากฏเมื่อมีธุรกรรมที่หักภาษี ณ ที่จ่าย"
          />
        )}
        {records.length > 1 && (
          <CardBody className="flex justify-end gap-2 border-t border-card-border">
            <Link to={`/wht/print?ids=${ids(records.map((r) => r.id))}&layout=pnd`} target="_blank">
              <Button variant="secondary"><Download size={15} /> ดาวน์โหลดทั้งหมด</Button>
            </Link>
          </CardBody>
        )}
      </Card>
    </div>
  )
}
