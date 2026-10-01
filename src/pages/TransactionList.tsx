import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Copy, ExternalLink, FileSearch, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { useAllVendors } from '../hooks/useVendors'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import {
  activeFilterCount,
  defaultFilters,
  emptyFilters,
  filtersFromParams,
  filtersToParams,
  nextSort,
  presetRange,
  sortDir,
  sortField,
  type PresetId,
  type SortField,
  type SortKey,
  type StatusFilter,
  type TransactionFilters,
} from '../lib/txn-filters'
import { cn } from '../lib/cn'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { StatusBadge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { FilterChip } from '../components/ui/filter-chip'
import { EmptyState } from '../components/ui/empty-state'
import { Button } from '../components/ui/button'
import { VendorPicker } from '../components/vendor-picker'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { vendorDisplayName } from '../lib/vendor-name'
import type { PaymentTransaction } from '../lib/types'

// Quick-filter status chips live in the toolbar; the month is a global
// accounting period (header bar) shared with WHT + Metrics. The granular
// status list and date presets live inside the "ตัวกรอง" panel.
const STATUS_CHIPS: { v: StatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'กำลังดำเนินการ' },
  { v: 'done', th: 'เสร็จสิ้น' },
  { v: 'voided', th: 'ยกเลิกเอกสาร' },
]

const STATUS_OPTIONS: { v: StatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'กำลังดำเนินการ (ฉบับร่าง/ส่ง/ลงนาม)' },
  { v: 'done', th: 'เสร็จสิ้น (ออกใบเสร็จแล้ว)' },
  { v: 'voided', th: 'ยกเลิกเอกสาร' },
  { v: 'draft', th: '— ฉบับร่าง' },
  { v: 'sent', th: '— ส่งลิงก์แล้ว' },
  { v: 'opened', th: '— เปิดลิงก์แล้ว' },
  { v: 'signed', th: '— ลงนามแล้ว' },
  { v: 'issued', th: '— ออกใบเสร็จแล้ว' },
  { v: 'expired', th: '— หมดอายุ' },
  { v: 'void', th: '— ยกเลิกเอกสาร' },
  { v: 'cancelled', th: '— เพิกถอนลิงก์' },
]

const PRESETS: { id: PresetId; th: string }[] = [
  { id: '7d', th: '7 วัน' },
  { id: '30d', th: '30 วัน' },
  { id: 'year', th: 'ปีนี้' },
]

const thBase = 'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-3 py-2.5 text-label font-semibold uppercase tracking-wide text-ink-500'
const tdCls = 'whitespace-nowrap border-b border-card-border px-3 py-2.5'

function SortHeader({
  field,
  label,
  sort,
  onSort,
  align = 'left',
}: {
  field: SortField
  label: string
  sort: SortKey
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortField(sort) === field
  const dir = sortDir(sort)
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={cn(thBase, align === 'right' && 'text-right')} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, field))}
        className={cn('inline-flex items-center gap-1 transition hover:text-ink-900', active && 'text-ink-900')}
      >
        {label}
        <Icon size={13} className={active ? '' : 'text-ink-300'} />
      </button>
    </th>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td className="border-b border-card-border px-3 py-3"><div className="h-3.5 w-24 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3">
            <div className="h-3.5 w-52 animate-pulse rounded bg-ink-100" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-ink-100" />
          </td>
          <td className="border-b border-card-border px-3 py-3"><div className="h-3.5 w-20 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3"><div className="h-3.5 w-28 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3"><div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3"><div className="ml-auto h-3.5 w-14 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3"><div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3"><div className="h-5 w-20 animate-pulse rounded-full bg-ink-100" /></td>
          <td className="border-b border-card-border px-3 py-3" />
        </tr>
      ))}
    </>
  )
}

function RowActions({ t }: { t: PaymentTransaction }) {
  const [copied, setCopied] = useState(false)
  const link = t.inviteToken ? `${location.origin}/v/${t.inviteToken}` : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="flex items-center justify-end gap-0.5">
      {link && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void copy() }}
          title="คัดลอกลิงก์ผู้ขาย"
          aria-label="คัดลอกลิงก์ผู้ขาย"
          className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        </button>
      )}
      {t.receiptNumber ? (
        <Link
          to={`/receipts/${t.id}`}
          onClick={(e) => e.stopPropagation()}
          title="เปิดใบเสร็จ"
          aria-label="เปิดใบเสร็จ"
          className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <ExternalLink size={15} />
        </Link>
      ) : (
        <span className="grid h-8 w-8 place-items-center text-ink-300"><ChevronRight size={16} /></span>
      )}
    </div>
  )
}

export function TransactionList() {
  const [params, setParams] = useSearchParams()
  const { month: globalMonth, setMonth: setGlobalMonth } = useGlobalMonth()
  const [filters, setFilters] = useState<TransactionFilters>(() => {
    if (params.toString()) return filtersFromParams(params)
    return { ...defaultFilters(), month: globalMonth }
  })
  const [showPanel, setShowPanel] = useState(false)
  const nav = useNavigate()

  // URL sync — filters survive refresh and are shareable.
  useEffect(() => {
    setParams(filtersToParams(filters), { replace: true })
  }, [filters, setParams])

  // A shared ?month= link adopts the month into the global period (invalid
  // values are ignored by the hook). Runs once on mount.
  const adoptedUrlMonth = useMemo(() => params.get('month'), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (adoptedUrlMonth) setGlobalMonth(adoptedUrlMonth)
  }, [adoptedUrlMonth, setGlobalMonth])

  // Global period → local filter (single source of truth for the month).
  useEffect(() => {
    setFilters((f) => (f.month === globalMonth ? f : { ...f, month: globalMonth }))
  }, [globalMonth])

  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()
  const { data, isLoading } = useTransactions(filters)
  const vendors = useAllVendors()

  const set = (patch: Partial<TransactionFilters>) => setFilters((f) => ({ ...f, ...patch }))
  // Custom ranges are mutually exclusive with the global month: picking one
  // clears the period everywhere (Transactions + WHT + Metrics).
  const clearGlobalMonth = () => setGlobalMonth('')
  const applyPreset = (id: PresetId) => {
    const r = presetRange(id)
    set({ from: r.from, to: r.to, month: '' })
    clearGlobalMonth()
  }
  const setRange = (patch: Partial<TransactionFilters>) => {
    set({ ...patch, month: '' })
    clearGlobalMonth()
  }
  const activeCount = activeFilterCount(filters)

  const rows = data ?? []
  const sumGross = rows.reduce((s, t) => s + t.grossAmount, 0)
  const sumWht = rows.reduce((s, t) => s + t.whtAmount, 0)
  const sumNet = rows.reduce((s, t) => s + t.netAmount, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="รายการธุรกรรมผู้ขาย"
        sub="สร้างรายการ · ส่งลิงก์ทาง LINE · ติดตามสถานะจนออกใบเสร็จ"
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
              <Input
                className={cn('pl-10', filters.search && 'pr-10')}
                placeholder="ค้นหาชื่อผู้ขาย / รายละเอียด / เลขรายการ / สลิป…"
                value={filters.search}
                onChange={(e) => set({ search: e.target.value })}
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => set({ search: '' })}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowPanel((v) => !v)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-body font-semibold transition',
                  showPanel || activeCount > 0 ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-300/50',
                )}
              >
                <SlidersHorizontal size={14} /> ตัวกรอง
                {activeCount > 0 && <span className="rounded-full bg-white/25 px-1.5 text-label">{activeCount}</span>}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-card-border pt-3">
            <span className="mr-1 text-label font-semibold text-ink-500">สถานะ</span>
            {STATUS_CHIPS.map((f) => (
              <FilterChip key={f.v} active={filters.status === f.v} onClick={() => set({ status: f.v })}>
                {f.th}
              </FilterChip>
            ))}
          </div>

          {showPanel && (
            <div className="grid gap-4 border-t border-card-border pt-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">สถานะ (ละเอียด)</p>
                <Select value={filters.status} onChange={(e) => set({ status: e.target.value as StatusFilter })}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.th}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="xl:col-span-2">
                <p className="mb-1.5 text-label font-semibold text-ink-500">ช่วงวันที่โอน</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESETS.map((p) => (
                    <FilterChip key={p.id} onClick={() => applyPreset(p.id)}>
                      {p.th}
                    </FilterChip>
                  ))}
                  <Input type="date" value={filters.from} onChange={(e) => setRange({ from: e.target.value })} className="h-9 w-auto text-body" />
                  <span className="text-ink-400">–</span>
                  <Input type="date" value={filters.to} onChange={(e) => setRange({ to: e.target.value })} className="h-9 w-auto text-body" />
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">ประเภทการจ่าย</p>
                <Select value={filters.paymentType} onChange={(e) => set({ paymentType: e.target.value })}>
                  <option value="">ทั้งหมด</option>
                  {cfg.paymentTypes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">สลิป</p>
                <div className="flex gap-1.5">
                  {([['all', 'ทั้งหมด'], ['with', 'มีสลิป'], ['without', 'ยังไม่แนบ']] as const).map(([v, th]) => (
                    <FilterChip key={v} active={filters.slip === v} onClick={() => set({ slip: v })} className="flex-1 justify-center">
                      {th}
                    </FilterChip>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-label font-semibold text-ink-500">ยอดสุทธิ (บาท)</p>
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

              <div className="flex items-end xl:col-span-2">
                <button
                  onClick={() => { setFilters(emptyFilters()); clearGlobalMonth() }}
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
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1060px] border-separate border-spacing-0 text-body">
            <thead>
              <tr>
                <th className={thBase}>ผู้ขาย</th>
                <th className={thBase}>รายการ</th>
                <SortHeader field="date" label="วันที่โอน" sort={filters.sort} onSort={(k) => set({ sort: k })} />
                <th className={thBase}>เลขที่ใบเสร็จ</th>
                <SortHeader field="gross" label="ยอดรวม (บาท)" sort={filters.sort} onSort={(k) => set({ sort: k })} align="right" />
                <SortHeader field="wht" label="หัก ณ ที่จ่าย" sort={filters.sort} onSort={(k) => set({ sort: k })} align="right" />
                <SortHeader field="net" label="สุทธิ (บาท)" sort={filters.sort} onSort={(k) => set({ sort: k })} align="right" />
                <th className={thBase}>สถานะ</th>
                <th className={cn(thBase, 'w-10')}><span className="sr-only">เปิด</span></th>
              </tr>
            </thead>
            <tbody>
              {!isLoading &&
                rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => nav(`/transactions/${t.id}`)}
                    className="cursor-pointer transition hover:bg-ink-50 focus-within:bg-ink-50"
                  >
                    <td className="max-w-[180px] border-b border-card-border px-3 py-2.5">
                      <p className="truncate font-semibold">{vendorDisplayName(t.vendor.prefix, t.vendor.name)}</p>
                    </td>
                    <td className="max-w-[340px] border-b border-card-border px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/transactions/${t.id}`}
                          className="min-w-0 flex-1 truncate font-medium leading-snug hover:underline"
                        >
                          {t.note?.trim() || t.lineItems[0]?.description || t.description}
                        </Link>
                        {t.lineItems.length > 1 && (
                          <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-micro font-semibold text-ink-600">
                            {t.lineItems.length} รายการ
                          </span>
                        )}
                      </div>
                      <p className="truncate text-label text-ink-500">
                        <span className="font-mono">{t.id}</span>
                        {t.slipReference && <> · <span className="font-mono">{t.slipReference}</span></>}
                      </p>
                    </td>
                    <td className={tdCls}>{fmtDateTH(t.transferDate)}</td>
                    <td className={cn(tdCls, 'font-mono text-label')}>
                      {t.receiptNumber ?? <span className="font-sans text-ink-400">—</span>}
                    </td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>{fmtTHB(t.grossAmount)}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>
                      {fmtTHB(t.whtAmount)}
                      <span className="ml-1.5 text-label text-ink-400">{t.whtRate}%</span>
                    </td>
                    <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{fmtTHB(t.netAmount)}</td>
                    <td className={tdCls}><StatusBadge status={t.status} /></td>
                    <td className="border-b border-card-border px-2 py-2.5">
                      <RowActions t={t} />
                    </td>
                  </tr>
                ))}
              {isLoading && <SkeletonRows rows={6} />}
            </tbody>
            {!isLoading && rows.length > 0 && (
              <tfoot>
                <tr className="bg-ink-50 font-semibold [&>td]:border-t [&>td]:border-card-border">
                  <td className="px-3 py-2.5" colSpan={4}>รวม {rows.length} รายการ</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtTHB(sumGross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtTHB(sumWht)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtTHB(sumNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!isLoading && rows.length === 0 && (
          <EmptyState
            icon={FileSearch}
            title="ไม่พบรายการตามเงื่อนไข"
            description="โปรดล้างตัวกรอง หรือสร้างรายการใหม่"
          />
        )}
      </Card>
    </div>
  )
}
