import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CircleDashed,
  Download,
  FileSearch,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useWhtList, useSetWhtStatus } from '../hooks/useWht'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { useDebounced } from '../hooks/useDebounced'
import { formatMonthTH } from '../lib/global-month'
import { fmtWhtDate } from '../lib/wht'
import { WHT_FORM_LABELS, WHT_FORM_TYPES, parseWhtListQuery, whtQueryToParams, type WhtListQuery } from '../lib/wht-list-query'
import { nextWhtSort, whtSortField, type WhtSortField, type WhtStatusFilter } from '../lib/wht-summary'
import { downloadCsv, exportFilename, whtToCsv } from '../lib/csv'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { FilterChip } from '../components/ui/filter-chip'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { Pagination } from '../components/ui/pagination'
import { useToast } from '../components/ui/toast'
import { WhtSummaryBar } from '../components/wht/wht-summary-bar'
import { cn } from '../lib/cn'

// Withholding-tax register.
//
// The previous version destructured only `data` from the query, so while loading
// — and forever, if the request failed — it rendered "ยังไม่มีรายการภาษีหัก ณ
// ที่จ่าย". A bookkeeper was told their tax register was empty when in fact the
// app had not asked yet. There is now a real loading state, a real error state
// with retry, and an empty state that distinguishes "no certificates yet" from
// "nothing matched your filters".
//
// Scope comes from the global period (issue_date, not transfer_date) and is
// overridable here, same as the transaction list.

const thBase =
  'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-3 py-2.5 text-label font-medium text-ink-500'

const STATUS_CHIPS: { v: WhtStatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: 'ยังไม่ยื่น' },
  { v: 'done', th: 'ยื่นแล้ว' },
]

function readPage(sp: URLSearchParams): number {
  const n = Number(sp.get('page'))
  return Number.isFinite(n) && n > 0 ? n - 1 : 0
}

function readSize(sp: URLSearchParams): number {
  const n = Number(sp.get('size'))
  return [25, 50, 100, 200].includes(n) ? n : 50
}

export function WhtList() {
  const { month: globalMonth } = useGlobalMonth()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const setStatus = useSetWhtStatus()
  const searchRef = useRef<HTMLInputElement>(null)

  // Seed from the URL (a shared "show me October" link) and the global period.
  const [url] = useState(() => parseWhtListQuery(params))
  const [query, setQuery] = useState<Omit<WhtListQuery, 'limit' | 'offset'>>(() => ({
    month: url.month || globalMonth,
    q: url.q,
    formType: url.formType,
    status: url.status,
    sort: url.sort,
  }))
  const [search, setSearch] = useState(query.q)
  const debouncedSearch = useDebounced(search, 250)
  const [page, setPage] = useState(() => readPage(params))
  const [pageSize, setPageSize] = useState(() => readSize(params))

  const effective = useMemo<Omit<WhtListQuery, 'limit' | 'offset'>>(
    () => (query.q === debouncedSearch ? query : { ...query, q: debouncedSearch }),
    [query, debouncedSearch],
  )

  const full: WhtListQuery = useMemo(
    () => ({ ...effective, limit: pageSize, offset: page * pageSize }),
    [effective, pageSize, page],
  )
  const wire = useMemo(() => whtQueryToParams(full), [full])

  // URL sync so a filtered register can be shared or bookmarked.
  useEffect(() => {
    const p = whtQueryToParams({ ...full, offset: 0 })
    if (page > 0) p.set('page', String(page + 1))
    if (pageSize !== 50) p.set('size', String(pageSize))
    setParams(p, { replace: true })
  }, [full, page, pageSize, setParams])

  // Following the global period: it is the app's source of truth for the period.
  useEffect(() => {
    setQuery((q) => (q.month === globalMonth ? q : { ...q, month: globalMonth }))
  }, [globalMonth])

  // Any change to the filter sends the user back to page 1.
  const signature = JSON.stringify(effective)
  useEffect(() => {
    setPage(0)
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isFetching, isError, error, refetch } = useWhtList(full, wire)
  const records = data?.records ?? []
  const total = data?.total ?? 0

  // Mirror the server clamp so the UI never sits on a page that cannot exist.
  useEffect(() => {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    if (page > pages - 1) setPage(pages - 1)
  }, [page, total, pageSize])

  const patch = useCallback((p: Partial<typeof query>) => setQuery((q) => ({ ...q, ...p })), [])

  const filtered = effective.q !== '' || effective.formType !== '' || effective.status !== 'all'
  const isEmpty = !isLoading && !isError && records.length === 0

  // Print scope mirrors the filter exactly — no ids in the URL, so this works
  // for a month with hundreds of certificates (the old ?ids= link broke at ~54).
  const printHref = (layout: 'pnd' | 'clean') => {
    const p = whtQueryToParams({ ...effective, limit: 0, offset: 0 })
    p.set('layout', layout)
    p.delete('limit')
    return `/wht/print?${p.toString()}`
  }

  const exportCsv = useCallback(() => {
    if (records.length === 0) {
      toast.show('ไม่มีรายการให้ส่งออก', 'error')
      return
    }
    downloadCsv(`wht-${effective.month || 'all'}-${exportFilename().replace(/^transactions-/, '')}`, whtToCsv(records))
    toast.show(`ส่งออก ${records.length} ฉบับแล้ว (หน้าที่แสดง)`)
  }, [records, effective.month, toast])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
    if (e.key === '/') {
      e.preventDefault()
      searchRef.current?.focus()
    }
  }, [])

  const th = (field: WhtSortField, label: string, align: 'left' | 'right' = 'left') => {
    const active = whtSortField(effective.sort) === field
    const dir = effective.sort.endsWith('-asc') ? 'asc' : 'desc'
    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <th
        scope="col"
        className={cn(thBase, align === 'right' && 'text-right')}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => patch({ sort: nextWhtSort(effective.sort, field) })}
          className={cn(
            'inline-flex items-center gap-1 transition hover:text-ink-900',
            align === 'right' && 'flex-row-reverse',
            active && 'text-ink-900',
          )}
        >
          {label}
          <Icon size={13} className={active ? '' : 'text-ink-300'} aria-hidden />
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-5" onKeyDown={onKey}>
      <PageHeader
        title="ภาษีหัก ณ ที่จ่าย (WHT)"
        sub={`หนังสือรับรองการหักภาษี ณ ที่จ่าย — ${effective.month ? `รอบ ${formatMonthTH(effective.month)}` : 'ทั้งหมด'} · ตามวันที่ออกหนังสือรับรอง`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={records.length === 0} title="ส่งออกเฉพาะหน้าที่แสดง">
              <Download size={16} aria-hidden /> ส่งออก CSV
            </Button>
            <Link to={printHref('pnd')} target="_blank" rel="noopener noreferrer">
              <Button disabled={total === 0} title={`พิมพ์หนังสือรับรองทั้งหมด ${total} ฉบับที่ตรองเงื่อนไข`}>
                <Printer size={16} aria-hidden /> พิมพ์ทั้งหมด ({total})
              </Button>
            </Link>
          </>
        }
      />

      {/* Totals describe the whole filtered set, not the page on screen. */}
      <WhtSummaryBar summary={data?.summary} loading={isLoading || isFetching} />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="wht-search" className="sr-only">
                ค้นหาหนังสือรับรอง
              </label>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input
                id="wht-search"
                ref={searchRef}
                className={cn('pl-10', search && 'pr-10')}
                placeholder="ค้นหาเลขที่หนังสือรับรอง / ชื่อผู้ถูกหักภาษี / รายละเอียด…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && search) {
                    e.stopPropagation()
                    setSearch('')
                  }
                }}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    searchRef.current?.focus()
                  }}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="whitespace-nowrap text-label text-ink-500">แบบยื่น</span>
                <Select
                  value={effective.formType}
                  onChange={(e) => patch({ formType: e.target.value as WhtListQuery['formType'] })}
                  aria-label="กรองตามแบบยื่นภาษี"
                  className="h-9 w-auto min-w-32"
                >
                  <option value="">ทุกแบบ</option>
                  {WHT_FORM_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {WHT_FORM_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-card-border pt-3">
            <span className="mr-1 text-label font-medium text-ink-500">สถานะการยื่น</span>
            {STATUS_CHIPS.map((c) => (
              <FilterChip key={c.v} active={effective.status === c.v} onClick={() => patch({ status: c.v })}>
                {c.th}
              </FilterChip>
            ))}
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setQuery((q) => ({ ...q, q: '', formType: '', status: 'all' }))
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
              >
                <RotateCcw size={13} aria-hidden /> ล้างตัวกรอง
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="โหลดข้อมูลภาษีหัก ณ ที่จ่ายไม่สำเร็จ"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            <div className="relative">
              {isFetching && !isLoading && (
                <div
                  className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-primary-soft"
                  role="progressbar"
                  aria-label="กำลังโหลดหนังสือรับรอง"
                >
                  <div className="h-full w-1/3 animate-pulse bg-primary" />
                </div>
              )}
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[880px] border-collapse text-body">
                  <thead>
                    <tr>
                      {th('date', 'วันที่ออก')}
                      <th scope="col" className={thBase}>
                        เลขที่หนังสือรับรอง
                      </th>
                      {th('vendor', 'ผู้ถูกหักภาษี')}
                      <th scope="col" className={thBase}>
                        แบบยื่น
                      </th>
                      {th('amount', 'ยอดเงิน (ฐานภาษี)', 'right')}
                      {th('wht', 'ภาษีที่หักไว้', 'right')}
                      <th scope="col" className={thBase}>
                        สถานะ
                      </th>
                      <th scope="col" className={cn(thBase, 'w-24 text-right')}>
                        พิมพ์
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={8} cols={7} />
                    ) : (
                      records.map((r) => {
                        const filed = r.status === 'done'
                        return (
                          <tr key={r.id} className="border-b border-card-border transition hover:bg-ink-50">
                            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{fmtWhtDate(r.issueDate)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono">{r.certificateNo ?? '—'}</td>
                            <td className="max-w-[240px] truncate px-3 py-2.5 font-semibold">
                              {r.vendorName ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span title={WHT_FORM_LABELS[r.formType]}>{WHT_FORM_LABELS[r.formType] ?? r.formType}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {r.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                              {r.whtAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold',
                                  filed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                                )}
                              >
                                {filed ? <CheckCircle2 size={12} aria-hidden /> : <CircleDashed size={12} aria-hidden />}
                                {filed ? 'ยื่นแล้ว' : 'ยังไม่ยื่น'}
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatus.mutate(
                                      { id: r.id, status: filed ? 'active' : 'done' },
                                      {
                                        onSuccess: () =>
                                          toast.show(
                                            filed ? `ย้าย ${r.certificateNo ?? r.id} กลับเป็นยังไม่ยื่นแล้ว` : `ทำเครื่องหมาย ${r.certificateNo ?? r.id} ว่ายื่นแล้ว`,
                                          ),
                                        onError: () => toast.show('อัปเดตสถานะไม่สำเร็จ', 'error'),
                                      },
                                    )
                                  }}
                                  title={filed ? 'ย้ายกลับเป็นยังไม่ยื่น' : 'ทำเครื่องหมายว่ายื่นแล้ว'}
                                  aria-label={filed ? `ย้าย ${r.certificateNo ?? r.id} กลับเป็นยังไม่ยื่น` : `ทำเครื่องหมาย ${r.certificateNo ?? r.id} ว่ายื่นแล้ว`}
                                  className={cn(
                                    'grid h-8 w-8 place-items-center rounded-control transition',
                                    filed
                                      ? 'text-success hover:bg-success-soft'
                                      : 'text-ink-400 hover:bg-ink-100 hover:text-success',
                                  )}
                                >
                                  {filed ? <CheckCircle2 size={15} aria-hidden /> : <CircleDashed size={15} aria-hidden />}
                                </button>
                                <Link
                                  to={`/wht/print?ids=${r.id}&layout=pnd`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="พิมพ์หนังสือรับรองฉบับนี้"
                                  aria-label={`พิมพ์หนังสือรับรอง ${r.certificateNo ?? r.id}`}
                                  className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                >
                                  <Download size={15} aria-hidden />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {isEmpty &&
              (filtered ? (
                <EmptyState
                  icon={FileSearch}
                  title="ไม่พบหนังสือรับรองตามเงื่อนไข"
                  description="ลองเปลี่ยนแบบยื่น สถานะการยื่น หรือคำค้นหา"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('')
                        setQuery((q) => ({ ...q, q: '', formType: '', status: 'all' }))
                      }}
                    >
                      ล้างตัวกรอง
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ReceiptText}
                  title="ยังไม่มีหนังสือรับรองในรอบนี้"
                  description="หนังสือรับรองจะถูกสร้างอัตโนมัติเมื่อออกใบเสร็จที่มีการหักภาษี ณ ที่จ่าย"
                />
              ))}

            {!isLoading && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                busy={isFetching}
                onPage={setPage}
                onPageSize={(s) => {
                  setPageSize(s)
                  setPage(0)
                }}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}
