import { Link } from 'react-router-dom'
import { FileText, Printer } from 'lucide-react'
import { useClientAuth } from '../lib/client-auth'
import { loadWht } from '../lib/wht-mock'
import { fmtWhtDate, fmtWhtNum } from '../lib/wht'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'

const thCls = 'px-3 py-2 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

export function WhtList() {
  const { activeTenant } = useClientAuth()
  const { records, vendors } = loadWht(activeTenant)
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? '—'
  const ids = (list: string[]) => list.join(',')

  return (
    <div className="space-y-5">
      <PageHeader title="ภาษีหัก ณ ที่จ่าย (WHT)" sub="ใบรับรองการหักภาษี ณ ที่จ่าย — เทมเพลตเดียวกับระบบบัญชี · แบบฟอร์มราชการ (PND) และแบบ A4" />

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
                <th className={`${thCls} w-56 text-right`}>พิมพ์</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-card-border last:border-0 hover:bg-ink-50">
                  <td className="px-3 py-2.5 font-mono text-body">{r.certificateNo ?? '—'}</td>
                  <td className="px-3 py-2.5 font-semibold">{vendorName(r.vendorId)}</td>
                  <td className="px-3 py-2.5 font-mono text-body uppercase">{r.formType}</td>
                  <td className="px-3 py-2.5">{fmtWhtDate(r.issueDate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">฿{fmtWhtNum(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">฿{fmtWhtNum(r.whtAmount)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/wht/print?ids=${r.id}&layout=pnd`} target="_blank">
                        <Button variant="secondary" className="h-9 px-3 text-body"><FileText size={14} /> แบบราชการ</Button>
                      </Link>
                      <Link to={`/wht/print?ids=${r.id}&layout=clean`} target="_blank">
                        <Button variant="secondary" className="h-9 px-3 text-body"><Printer size={14} /> A4</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length === 0 && (
          <CardBody><p className="py-8 text-center text-body text-ink-500">ยังไม่มีรายการ WHT</p></CardBody>
        )}
        {records.length > 1 && (
          <CardBody className="flex justify-end gap-2 border-t border-card-border">
            <Link to={`/wht/print?ids=${ids(records.map((r) => r.id))}&layout=pnd`} target="_blank">
              <Button variant="secondary"><FileText size={15} /> พิมพ์ทั้งหมด (แบบราชการ)</Button>
            </Link>
          </CardBody>
        )}
      </Card>
    </div>
  )
}
