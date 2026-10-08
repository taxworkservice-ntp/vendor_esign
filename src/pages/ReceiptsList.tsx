import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, FileSearch, Printer, ReceiptText, Search } from 'lucide-react'
import { useReceiptRegister } from '../hooks/useReceiptRegister'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { useDebounced } from '../hooks/useDebounced'
import { formatMonthTH } from '../lib/global-month'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import {
  asReceiptSort,
  DEFAULT_RECEIPT_SORT,
  nextReceiptSort,
  receiptSortDir,
  receiptSortField,
  type ReceiptRegisterQuery,
  type ReceiptSortField,
} from '../lib/receipts-register'
import { fmtDateTH, fmtDateTimeTHSec, fmtTHB } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { HelpLink } from '../components/ui/help-link'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { Pagination } from '../components/ui/pagination'
import { ClickableRow, SortableTh, Td, Th, tableCls } from '../components/ui/data-table'
import { cn } from '../lib/cn'

// Receipt register — issued receipts, scoped by the receipt's own issue date
// (the accounting period of the document, not the payment date). Mirrors the
// WHT register. The ZIP export renders each row through the same ReceiptSheet
// used on screen, so every PDF matches the preview.

function readPage(sp: URLSearchParams): number {
  const n = Number(sp.get('page'))
  return Number.isFinite(n) && n > 0 ? n - 1 : 0
}
function readSize(sp: URLSearchParams): number {
  const n = Number(sp.get('size'))
  return [25, 50, 100, 200].includes(n) ? n : 50
}

export function ReceiptsList() {
  const { month: globalMonth } = useGlobalMonth()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const { data: settings } = useSettings()
  const clientCode = (settings ?? defaultSettings()).clientCode

  const [month, setMonth] = useState(() => params.get('month') ?? globalMonth)
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [sort, setSort] = useState(() => asReceiptSort(params.get('sort')))
  const [page, setPage] = useState(() => readPage(params))
  const [pageSize, setPageSize] = useState(() => readSize(params))
  const debouncedSearch = useDebounced(search, 250)

  // The global period is the app's source of truth for the period.
  useEffect(() => {
    setMonth(globalMonth)
  }, [globalMonth])

  const query = useMemo<ReceiptRegisterQuery>(
    () => ({ month, q: debouncedSearch, sort, limit: pageSize, offset: page * pageSize }),
    [month, debouncedSearch, sort, pageSize, page],
  )

  // URL sync so a filtered register can be shared or bookmarked.
  useEffect(() => {
    const p = new URLSearchParams()
    if (month && month !== globalMonth) p.set('month', month)
    if (debouncedSearch) p.set('q', debouncedSearch)
    if (sort !== DEFAULT_RECEIPT_SORT) p.set('sort', sort)
    if (page > 0) p.set('page', String(page + 1))
    if (pageSize !== 50) p.set('size', String(pageSize))
    setParams(p, { replace: true })
  }, [month, globalMonth, debouncedSearch, sort, page, pageSize, setParams])

  // Any filter change returns to page 1.
  useEffect(() => {
    setPage(0)
  }, [month, debouncedSearch, sort])

  const { data, isLoading, isFetching, isError, error, refetch } = useReceiptRegister(query)
  const rows = data?.receipts ?? []
  const total = data?.total ?? 0
  const summary = data?.summary

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    if (page > pages - 1) setPage(pages - 1)
  }, [page, total, pageSize])

  const th = (field: ReceiptSortField, label: string, align?: 'left' | 'right') => (
    <SortableTh
      label={label}
      align={align}
      active={receiptSortField(sort) === field}
      dir={receiptSortDir(sort)}
      onSort={() => setSort((s) => nextReceiptSort(s, field))}
    />
  )

  const downloadAllHref = useMemo(() => {
    const p = new URLSearchParams()
    if (month) p.set('month', month)
    if (debouncedSearch) p.set('q', debouncedSearch)
    p.set('download', '1')
    return `/receipts/download?${p.toString()}`
  }, [month, debouncedSearch])

  const filtered = debouncedSearch.trim() !== '' || month !== globalMonth
  const isEmpty = !isLoading && !isError && rows.length === 0

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '/') {
      e.preventDefault()
      searchRef.current?.focus()
    }
  }, [])

  return (
    <div className="space-y-5" onKeyDown={onKey}>
      <PageHeader
        title="ใบเสร็จรับเงิน"
        sub={`ทะเบียนใบเสร็จที่ออกแล้ว — ${month ? `รอบ ${formatMonthTH(month)}` : 'ทั้งหมด'} · ตามวันที่รับชำระ`}
        actions={
          <>
            <HelpLink to="/help#receipt-register" />
            <a href={downloadAllHref} target="_blank" rel="noopener noreferrer" aria-disabled={total === 0}>
              <Button disabled={total === 0} title={`ดาวน์โหลดใบเสร็จทั้งหมด ${total} ฉบับที่ตรงเงื่อนไข (PDF แยกต่อฉบับ, รวมเป็น ZIP)`}>
                <Download size={16} aria-hidden /> ดาวน์โหลดทั้งหมด ({total})
              </Button>
            </a>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="relative">
            <label htmlFor="receipt-search" className="sr-only">
              ค้นหาเลขที่ใบเสร็จ / ชื่อผู้ขาย
            </label>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              id="receipt-search"
              ref={searchRef}
              className="pl-10"
              placeholder="ค้นหาเลขที่ใบเสร็จ / ชื่อผู้ขาย…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="โหลดทะเบียนใบเสร็จไม่สำเร็จ"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 gap-px border-b border-card-border bg-card-border sm:grid-cols-4">
                <Stat label="จำนวนใบเสร็จ" value={summary.count.toLocaleString('th-TH')} />
                <Stat label="ยอดเงิน (ฐานภาษี)" value={fmtTHB(summary.gross)} />
                <Stat label="ภาษีที่หักไว้" value={fmtTHB(summary.wht)} />
                <Stat label="ยอดสุทธิ" value={fmtTHB(summary.net)} />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className={cn(tableCls, 'min-w-[1120px]')}>
                <thead>
                  <tr>
                    {th('date', 'วันที่รับชำระ')}
                    {th('issue', 'ออกเมื่อ')}
                    {th('number', 'เลขที่ใบเสร็จ')}
                    {th('vendor', 'ผู้ขาย')}
                    {th('gross', 'ยอดเงิน (ฐานภาษี)', 'right')}
                    {th('wht', 'หัก ณ ที่จ่าย', 'right')}
                    {th('net', 'สุทธิ', 'right')}
                    {th('updated', 'อัปเดตล่าสุด')}
                    <Th align="right" className="w-24">จัดการ</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <TableSkeleton rows={6} cols={9} />
                  ) : (
                    rows.map((r) => (
                      <ClickableRow key={r.id} label={`เปิดใบเสร็จ ${r.number}`} onOpen={() => nav(`/receipts/${r.id}`)}>
                        <Td className="whitespace-nowrap tabular-nums">{fmtDateTH(r.transferDate)}</Td>
                        <Td className="whitespace-nowrap tabular-nums text-ink-500">{fmtDateTH(r.issueDate)}</Td>
                        <Td className="whitespace-nowrap font-mono font-semibold">{r.number}</Td>
                        <Td>
                          <span className="truncate font-medium">{r.vendorName || '—'}</span>
                        </Td>
                        <Td align="right" className="whitespace-nowrap tabular-nums">{fmtTHB(r.grossAmount)}</Td>
                        <Td align="right" className="whitespace-nowrap tabular-nums text-ink-500">
                          {r.whtAmount ? fmtTHB(r.whtAmount) : '—'}
                        </Td>
                        <Td align="right" className="whitespace-nowrap font-semibold tabular-nums">{fmtTHB(r.netAmount)}</Td>
                        <Td className="whitespace-nowrap tabular-nums text-ink-500">
                          {r.updatedAt ? fmtDateTimeTHSec(r.updatedAt) : '—'}
                        </Td>
                        <Td className="px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => nav(`/receipts/${r.id}`)}
                              title="เปิด / ดาวน์โหลด"
                              aria-label={`เปิดใบเสร็จ ${r.number}`}
                              className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                            >
                              <Printer size={15} aria-hidden />
                            </button>
                            {r.verificationCode && (
                              <a
                                href={`/verify/${r.verificationCode}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="ตรวจสอบความถูกต้อง (หน้าสาธารณะ)"
                                aria-label={`ตรวจสอบใบเสร็จ ${r.number}`}
                                className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                              >
                                <ReceiptText size={15} aria-hidden />
                              </a>
                            )}
                          </div>
                        </Td>
                      </ClickableRow>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {isEmpty &&
              (filtered ? (
                <EmptyState
                  icon={FileSearch}
                  title="ไม่พบใบเสร็จตามเงื่อนไข"
                  description="ลองเปลี่ยนรอบเดือนหรือคำค้นหา"
                  action={
                    <Button variant="secondary" onClick={() => setSearch('')}>
                      ล้างคำค้นหา
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ReceiptText}
                  title="ยังไม่มีใบเสร็จในรอบนี้"
                  description="ใบเสร็จจะปรากฏที่นี่เมื่อผู้ขายลงนามและระบบออกเลขที่ใบเสร็จแล้ว"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-label text-ink-500">{label}</p>
      <p className="mt-0.5 text-title font-semibold tabular-nums">{value}</p>
    </div>
  )
}
