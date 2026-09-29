import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { useAllVendors } from '../hooks/useVendors'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import {
  activeFilterCount,
  defaultFilters,
  emptyFilters,
  filtersFromParams,
  filtersToParams,
  monthsOf,
  presetRange,
  type PresetId,
  type StatusFilter,
  type TransactionFilters,
} from '../lib/txn-filters'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { StatusBadge } from '../components/ui/badge'
import { Input, inputCls } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { VendorPicker } from '../components/vendor-picker'
import { fmtTHB, fmtDateTH } from '../lib/format'

// Quick-filter chips (groups) + a full status dropdown.
const STATUS_CHIPS: { v: StatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ใช้งานอยู่' },
  { v: 'done', th: 'เสร็จสิ้น' },
  { v: 'voided', th: 'ยกเลิก · void' },
]

const STATUS_OPTIONS: { v: StatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ใช้งานอยู่ (ร่าง/ส่ง/เซ็น)' },
  { v: 'done', th: 'เสร็จสิ้น (ออกใบเสร็จ)' },
  { v: 'voided', th: 'ยกเลิก · void' },
  { v: 'draft', th: '— ฉบับร่าง' },
  { v: 'sent', th: '— ส่งลิงก์แล้ว' },
  { v: 'opened', th: '— เปิดแล้ว' },
  { v: 'signed', th: '— เซ็นแล้ว' },
  { v: 'issued', th: '— ออกใบเสร็จ' },
  { v: 'expired', th: '— หมดอายุ' },
  { v: 'void', th: '— void' },
  { v: 'cancelled', th: '— ยกเลิก' },
]

const PRESETS: { id: PresetId; th: string }[] = [
  { id: '7d', th: '7 วัน' },
  { id: '30d', th: '30 วัน' },
  { id: 'month', th: 'เดือนนี้' },
  { id: 'year', th: 'ปีนี้' },
]

const thCls = 'px-3 py-2 text-left text-label font-semibold uppercase tracking-wide text-ink-500'
const tdCls = 'whitespace-nowrap px-3 py-2'

export function TransactionList() {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<TransactionFilters>(() =>
    params.toString() ? filtersFromParams(params) : defaultFilters(),
  )
  const [showPanel, setShowPanel] = useState(false)
  const nav = useNavigate()

  // URL sync — filters survive refresh and are shareable.
  useEffect(() => {
    setParams(filtersToParams(filters), { replace: true })
  }, [filters, setParams])

  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()
  const { data, isLoading } = useTransactions(filters)
  const { data: allData } = useTransactions(emptyFilters())
  const vendors = useAllVendors()

  const months = useMemo(() => monthsOf(allData ?? []), [allData])
  const set = (patch: Partial<TransactionFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const applyPreset = (id: PresetId) => {
    const r = presetRange(id)
    set({ from: r.from, to: r.to, month: '' })
  }
  const activeCount = activeFilterCount(filters)

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
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input className="pl-10" placeholder="ค้นหาชื่อผู้ขาย / รายละเอียด / เลขรายการ / สลิป…" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_CHIPS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => set({ status: f.v })}
                  className={`rounded-full px-3 py-1.5 text-body font-semibold transition ${
                    filters.status === f.v ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  {f.th}
                </button>
              ))}
              <select
                value={filters.status}
                onChange={(e) => set({ status: e.target.value as StatusFilter })}
                className="h-8 rounded-control border border-card-border bg-white px-2 text-body font-semibold text-ink-700"
                title="สถานะ (แบบละเอียด)"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.th}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-body font-semibold transition ${
                  showPanel || activeCount > 0 ? 'bg-teal-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-100'
                }`}
              >
                <SlidersHorizontal size={14} /> ตัวกรอง
                {activeCount > 0 && <span className="rounded-full bg-white/25 px-1.5 text-label">{activeCount}</span>}
              </button>
            </div>
          </div>

          {showPanel && (
            <div className="grid gap-4 border-t border-card-border pt-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <p className="mb-1.5 text-label font-semibold text-ink-500">ช่วงวันที่โอน</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className="rounded-control bg-ink-100 px-2.5 py-1.5 text-body font-semibold text-ink-700 hover:bg-ink-100"
                    >
                      {p.th}
                    </button>
                  ))}
                  <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value, month: '' })} className="h-9 w-auto text-body" />
                  <span className="text-ink-400">–</span>
                  <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value, month: '' })} className="h-9 w-auto text-body" />
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">เดือน</p>
                <select
                  className={inputCls}
                  value={filters.month}
                  onChange={(e) => set({ month: e.target.value, from: '', to: '' })}
                >
                  <option value="">ทุกเดือน</option>
                  {months.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">ประเภทการจ่าย</p>
                <select className={inputCls} value={filters.paymentType} onChange={(e) => set({ paymentType: e.target.value })}>
                  <option value="">ทั้งหมด</option>
                  {cfg.paymentTypes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">สลิป</p>
                <div className="flex gap-1.5">
                  {([['all', 'ทั้งหมด'], ['with', 'มีสลิป'], ['without', 'ยังไม่แนบ']] as const).map(([v, th]) => (
                    <button
                      key={v}
                      onClick={() => set({ slip: v })}
                      className={`flex-1 rounded-control px-2 py-2 text-body font-semibold transition ${
                        filters.slip === v ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-100'
                      }`}
                    >
                      {th}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">ยอดสุทธิ (฿)</p>
                <div className="flex items-center gap-1.5">
                  <Input inputMode="decimal" placeholder="ต่ำสุด" value={filters.minNet} onChange={(e) => set({ minNet: e.target.value })} className="h-10 tabular-nums" />
                  <span className="text-ink-400">–</span>
                  <Input inputMode="decimal" placeholder="สูงสุด" value={filters.maxNet} onChange={(e) => set({ maxNet: e.target.value })} className="h-10 tabular-nums" />
                </div>
              </div>

              <div className="xl:col-span-2">
                <p className="mb-1.5 text-label font-semibold text-ink-500">ผู้ขาย</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <VendorPicker
                      vendors={vendors}
                      value={filters.vendorId || undefined}
                      onChange={(id) => set({ vendorId: id })}
                      allowAdd={false}
                      compact
                    />
                  </div>
                  {filters.vendorId && (
                    <button onClick={() => set({ vendorId: '' })} className="rounded-control px-2.5 py-2 text-body font-semibold text-ink-600 hover:bg-ink-100">
                      ล้าง
                    </button>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">เรียงลำดับ</p>
                <select className={inputCls} value={filters.sort} onChange={(e) => set({ sort: e.target.value as TransactionFilters['sort'] })}>
                  <option value="date-desc">วันที่ล่าสุด</option>
                  <option value="date-asc">วันที่เก่าสุด</option>
                  <option value="net-desc">ยอดสุทธิมาก→น้อย</option>
                  <option value="net-asc">ยอดสุทธิน้อย→มาก</option>
                </select>
              </div>

              <div className="flex items-end xl:col-span-2">
                <button
                  onClick={() => setFilters(emptyFilters())}
                  className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-body font-semibold text-ink-600 hover:bg-ink-100"
                >
                  <X size={14} /> ล้างตัวกรองทั้งหมด
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-body">
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th className={thCls}>รายการ</th>
                <th className={thCls}>วันที่โอน</th>
                <th className={thCls}>สลิป</th>
                <th className={`${thCls} text-right`}>ยอดรวม</th>
                <th className={`${thCls} text-right`}>หัก ณ ที่จ่าย</th>
                <th className={`${thCls} text-right`}>สุทธิ</th>
                <th className={thCls}>สถานะ</th>
                <th className={`${thCls} w-8`}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => nav(`/transactions/${t.id}`)}
                  className="cursor-pointer border-b border-card-border transition last:border-0 hover:bg-ink-50"
                >
                  <td className="max-w-[360px] px-3 py-2">
                    <p className="truncate font-semibold leading-snug">{t.description}</p>
                    <p className="truncate text-label text-ink-500">
                      <span className="font-mono">{t.id}</span> · {t.vendor.name}
                    </p>
                  </td>
                  <td className={tdCls}>{fmtDateTH(t.transferDate)}</td>
                  <td className={`${tdCls} font-mono text-label`}>{t.slipReference || <span className="font-sans text-ink-400">—</span>}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>฿{fmtTHB(t.grossAmount)}</td>
                  <td className={`${tdCls} text-right tabular-nums text-ink-500`}>
                    {t.whtRate}% · ฿{fmtTHB(t.whtAmount)}
                  </td>
                  <td className={`${tdCls} text-right font-semibold tabular-nums`}>฿{fmtTHB(t.netAmount)}</td>
                  <td className={tdCls}><StatusBadge status={t.status} /></td>
                  <td className="px-2 py-2 text-ink-400"><ChevronLeft size={15} className="rotate-180" /></td>
                </tr>
              ))}
            </tbody>
            {(data?.length ?? 0) > 0 && (
              <tfoot>
                <tr className="bg-ink-50/80 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>รวม {data?.length} รายการ</td>
                  <td className="px-3 py-2 text-right tabular-nums">฿{fmtTHB(sumGross)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">฿{fmtTHB(sumNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {isLoading && <p className="px-4 py-6 text-body text-ink-500">กำลังโหลด…</p>}
        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">ไม่พบรายการตามเงื่อนไข</p>
            <p className="mt-1 text-body text-ink-500">ลองล้างตัวกรอง หรือสร้างรายการใหม่</p>
          </div>
        )}
      </Card>
    </div>
  )
}
