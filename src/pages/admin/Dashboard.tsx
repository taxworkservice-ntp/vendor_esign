import { Link } from 'react-router-dom'
import { BarChart3, Building2, FileText, Landmark, PenLine, ScrollText, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAdminOverview } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { fmtDateTimeTH } from '../../lib/format'
import { cn } from '../../lib/cn'

const n = (v: number) => v.toLocaleString('th-TH')

function Stat({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-control', tone ?? 'bg-ink-100 text-ink-600')}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-label text-ink-500">{label}</p>
          <p className="text-subtitle font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-label text-ink-400">{sub}</p>}
        </div>
      </CardBody>
    </Card>
  )
}

export function Dashboard() {
  const { data, isLoading } = useAdminOverview()

  return (
    <div className="space-y-5">
      <PageHeader
        title="แดชบอร์ดผู้ให้บริการ"
        sub="ภาพรวมทั้งแพลตฟอร์ม · ลูกค้า ผู้ใช้ และเอกสารที่ออกแล้ว"
        actions={
          <Link to="/admin/clients/new">
            <Button>เพิ่มลูกค้า</Button>
          </Link>
        }
      />

      {isLoading || !data ? (
        <Card>
          <CardBody className="text-body text-ink-500">กำลังโหลด…</CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Building2}
              label="ลูกค้า (เวิร์กสเปซ)"
              value={n(data.tenants.total)}
              sub={`ใช้งาน ${n(data.tenants.active)} · ระงับ ${n(data.tenants.suspended)}`}
              tone="bg-primary-soft text-primary-text"
            />
            <Stat icon={Users} label="ผู้ใช้ทั้งหมด" value={n(data.users.total)} sub={`ใช้งาน ${n(data.users.active)}`} tone="bg-success-soft text-success" />
            <Stat icon={FileText} label="ธุรกรรม" value={n(data.counts.transactions)} tone="bg-ink-100 text-ink-600" />
            <Stat icon={PenLine} label="การลงนาม" value={n(data.counts.signings)} tone="bg-ink-100 text-ink-600" />
            <Stat icon={BarChart3} label="ใบเสร็จที่ออกแล้ว" value={n(data.counts.receipts)} tone="bg-success-soft text-success" />
            <Stat icon={Landmark} label="หนังสือรับรองหักภาษี" value={n(data.counts.wht)} tone="bg-warning-soft text-warning" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
                <h2 className="text-body font-semibold">ลูกค้าล่าสุด</h2>
                <Link to="/admin/clients" className="text-label font-medium text-primary-text hover:underline">
                  ดูทั้งหมด
                </Link>
              </div>
              <CardBody className="space-y-1">
                {data.recentTenants.length === 0 ? (
                  <p className="py-4 text-center text-body text-ink-400">ยังไม่มีลูกค้า</p>
                ) : (
                  data.recentTenants.map((t) => (
                    <Link
                      key={t.id}
                      to={`/admin/clients/${t.id}`}
                      className="flex items-center gap-3 rounded-control px-2 py-2 transition hover:bg-ink-50"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-ink-100 text-label font-semibold text-ink-600">
                        {t.clientCode.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium">{t.name}</span>
                        <span className="block font-mono text-label text-ink-400">{t.clientCode}</span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-label font-semibold',
                          t.status === 'active' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                        )}
                      >
                        {t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}
                      </span>
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
                <h2 className="flex items-center gap-2 text-body font-semibold">
                  <ScrollText size={16} className="text-ink-400" aria-hidden /> กิจกรรมล่าสุด
                </h2>
                <Link to="/admin/audit" className="text-label font-medium text-primary-text hover:underline">
                  ดูทั้งหมด
                </Link>
              </div>
              <CardBody className="space-y-1">
                {data.recentAudit.length === 0 ? (
                  <p className="py-4 text-center text-body text-ink-400">ยังไม่มีกิจกรรม</p>
                ) : (
                  data.recentAudit.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-control px-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-label text-ink-700">{e.eventType}</span>
                        <span className="block truncate text-label text-ink-400">
                          {e.actor ?? '—'} · {e.tenantId}
                        </span>
                      </span>
                      <span className="shrink-0 text-label tabular-nums text-ink-400">{fmtDateTimeTH(String(e.createdAt))}</span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
