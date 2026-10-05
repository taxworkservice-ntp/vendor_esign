import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ScrollText, Search } from 'lucide-react'
import { useAdminTenants, useAuditLog } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { TableSkeleton } from '../../components/ui/table-skeleton'
import { Row, Td, Th, tableCls } from '../../components/ui/data-table'
import { useDebounced } from '../../hooks/useDebounced'
import { useToast } from '../../components/ui/toast'
import { downloadCsv, toCsv, withBom, type CsvColumn } from '../../lib/csv'
import { downloadName } from '../../lib/download-name'
import { fmtDateTimeTH } from '../../lib/format'
import type { AuditEvent } from '../../hooks/useAdmin'
import { cn } from '../../lib/cn'

const PAGE = 50

const COLUMNS: CsvColumn<AuditEvent>[] = [
  { header: 'เวลา', value: (e) => String(e.createdAt), text: false },
  { header: 'เวิร์กสเปซ', value: (e) => e.tenantId },
  { header: 'เหตุการณ์', value: (e) => e.eventType, text: false },
  { header: 'เอนทิตี', value: (e) => `${e.entityType}:${e.entityId}`, text: false },
  { header: 'ผู้กระทำ', value: (e) => e.actor ?? '', text: false },
  { header: 'IP', value: (e) => e.ip ?? '', text: false },
]

export function AuditLog() {
  const [q, setQ] = useState('')
  const [tenant, setTenant] = useState('')
  const [event, setEvent] = useState('')
  const [offset, setOffset] = useState(0)
  const debouncedQ = useDebounced(q, 250)
  const { data: tenants } = useAdminTenants()
  const { data, isLoading } = useAuditLog({ q: debouncedQ, tenant, event, limit: PAGE, offset })
  const toast = useToast()

  const events = data?.events ?? []
  const total = data?.total ?? 0

  const exportCsv = () => {
    if (events.length === 0) {
      toast.show('ไม่มีรายการให้ส่งออก', 'error')
      return
    }
    downloadCsv(downloadName({ kind: 'audit', clientCode: 'PLATFORM', ext: 'csv' }), withBom(toCsv(events, COLUMNS)))
    toast.show(`ส่งออกบันทึกกิจกรรม ${events.length} รายการแล้ว`)
  }

  const reset = (fn: () => void) => {
    setOffset(0)
    fn()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="บันทึกกิจกรรม"
        sub="เหตุการณ์ทั้งหมดในระบบ · กรองตามลูกค้า/เหตุการณ์ · ส่งออก CSV"
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={events.length === 0}>
            <Download size={16} aria-hidden /> ส่งออก CSV
          </Button>
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              className="pl-10"
              placeholder="ค้นหาเหตุการณ์ / ผู้กระทำ…"
              value={q}
              onChange={(e) => reset(() => setQ(e.target.value))}
              autoComplete="off"
            />
          </div>
          <Select
            value={tenant}
            onChange={(e) => reset(() => setTenant(e.target.value))}
            className="h-11 w-auto min-w-40"
            aria-label="กรองตามลูกค้า"
          >
            <option value="">ทุกลูกค้า</option>
            <option value="PLATFORM">PLATFORM</option>
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.clientCode} · {t.displayName}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className={cn(tableCls, 'min-w-[880px]')}>
            <thead>
              <tr>
                <Th className="w-44">เวลา</Th>
                <Th className="w-28">เวิร์กสเปซ</Th>
                <Th>เหตุการณ์</Th>
                <Th>เอนทิตี</Th>
                <Th className="w-48">ผู้กระทำ</Th>
                <Th className="w-28">IP</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={8} cols={6} />
              ) : (
                events.map((e) => (
                  <Row key={e.id}>
                    <Td className="whitespace-nowrap tabular-nums text-ink-500">{fmtDateTimeTH(String(e.createdAt))}</Td>
                    <Td className="font-mono text-label text-ink-600">{e.tenantId}</Td>
                    <Td className="font-mono text-label text-ink-700">{e.eventType}</Td>
                    <Td className="truncate font-mono text-label text-ink-500">{e.entityType}:{e.entityId}</Td>
                    <Td className="truncate text-ink-600">{e.actor ?? '—'}</Td>
                    <Td className="whitespace-nowrap font-mono text-label text-ink-400">{e.ip ?? '—'}</Td>
                  </Row>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && events.length === 0 && (
          <EmptyState icon={ScrollText} title="ไม่พบบันทึกกิจกรรม" description="ยังไม่มีเหตุการณ์ที่ตรงกับตัวกรอง" />
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between gap-3 border-t border-card-border px-4 py-3 text-label text-ink-500">
            <span>
              แสดง {offset + 1}–{Math.min(offset + PAGE, total)} จาก {total.toLocaleString('th-TH')}
            </span>
            <div className="flex gap-1.5">
              <Button variant="secondary" className="h-9 px-3" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                <ChevronLeft size={15} aria-hidden /> ก่อนหน้า
              </Button>
              <Button
                variant="secondary"
                className="h-9 px-3"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset(offset + PAGE)}
              >
                ถัดไป <ChevronRight size={15} aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
