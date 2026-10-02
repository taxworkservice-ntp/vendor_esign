import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, FileSearch, Plus, Rows3, Rows4 } from 'lucide-react'
import { useAllTransactions, useTransactions } from '../hooks/useTransactions'
import { useGlobalMonth } from '../hooks/useGlobalMonth'
import { useAllVendors } from '../hooks/useVendors'
import { useSettings } from '../hooks/useSettings'
import { useDebounced } from '../hooks/useDebounced'
import { useClientAuth } from '../lib/client-auth'
import { readStoredMonth } from '../lib/global-month'
import { defaultSettings } from '../lib/settings'
import {
  activeFilterCount,
  clampPage,
  defaultFilters,
  describeActiveFilters,
  emptyFilters,
  filtersFromParams,
  presetRange,
  resolvePeriod,
  STATUS_GROUP_LABELS,
  type ActiveFilter,
  type PresetId,
  type SortKey,
  type StatusFilter,
  type TransactionFilters,
} from '../lib/txn-filters'
import { parseListQuery, queryFromFilters, queryToParams } from '../lib/txn-list-query'
import { attentionFor } from '../lib/attention'
import { downloadCsv, txnsToCsv } from '../lib/csv'
import { downloadName } from '../lib/download-name'
import { inviteUrl } from '../lib/app-url'
import { cn } from '../lib/cn'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { Button } from '../components/ui/button'
import { SummaryBar } from '../components/ui/summary-bar'
import { Pagination } from '../components/ui/pagination'
import { useToast } from '../components/ui/toast'
import { TxnToolbar } from '../components/transactions/txn-toolbar'
import { TxnFiltersPanel } from '../components/transactions/txn-filters-panel'
import { TxnTable, TxnTableFrame } from '../components/transactions/txn-table'
import { SelectAllMatching, TxnBulkBar } from '../components/transactions/txn-bulk-bar'
import { CustomRangeNotice } from '../components/transactions/custom-range-notice'
import type { PaymentTransaction } from '../lib/types'

// Quick-filter status chips. The month is a global accounting period (header
// bar) shared with WHT + Metrics; the granular status list and date presets
// live in the "ตัวกรอง" panel.
const STATUS_CHIPS: { v: StatusFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'active', th: STATUS_GROUP_LABELS.active },
  { v: 'done', th: STATUS_GROUP_LABELS.done },
  { v: 'voided', th: STATUS_GROUP_LABELS.voided },
]

const DENSE_KEY = 'tw:txn-dense'

function readDense(): boolean {
  try {
    return localStorage.getItem(DENSE_KEY) === '1'
  } catch {
    return false
  }
}

export function TransactionList() {
  const [params, setParams] = useSearchParams()
  const { month: globalMonth, setMonth: setGlobalMonth } = useGlobalMonth()
  const { activeTenant } = useClientAuth()
  const toast = useToast()
  const nav = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  // Filters, paging and page size all come from the same URL. Reuse the shared
  // validator so the page can never hold a paging state the API would reject
  // (an unknown `size`, say) — one vocabulary, no second parser to drift.
  const [url] = useState(() => parseListQuery(params))

  const [filters, setFilters] = useState<TransactionFilters>(() => {
    if (params.toString()) return filtersFromParams(params)
    return { ...defaultFilters(), month: globalMonth }
  })
  const [page, setPage] = useState(() => Math.floor(url.offset / Math.max(1, url.limit)))
  const [pageSize, setPageSize] = useState(() => url.limit)
  const [showPanel, setShowPanel] = useState(false)
  const [dense, setDense] = useState(readDense)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // Search is held separately so typing is instant; only the debounced copy
  // reaches the query key, so we do not refetch on every keystroke.
  const [search, setSearch] = useState(filters.search)
  const debouncedSearch = useDebounced(search, 250)
  const queryFilters = useMemo<TransactionFilters>(
    () => (filters.search === debouncedSearch ? filters : { ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  )

  // ── URL sync ────────────────────────────────────────────────────────────
  // Filters, sort, page and page size all survive refresh and are shareable.
  // Paging rides on the shared `limit`/`offset` pair, so there is a single
  // representation the API also understands.
  //
  // `month` is deliberately NOT mirrored back. The header period already owns
  // it and persists it per tenant, so writing it here created a second source
  // of truth: a stale ?month= from an earlier visit was re-adopted on the next
  // mount and silently undid a newer pick made on another page. A month is
  // written only when it DIVERGES from the stored period, which is exactly the
  // case where a shared link has to carry it.
  const storedMonth = readStoredMonth(activeTenant)
  useEffect(() => {
    const p = queryToParams({ ...queryFromFilters(queryFilters), limit: pageSize, offset: page * pageSize })
    if (queryFilters.month === storedMonth) p.delete('month')
    setParams(p, { replace: true })
  }, [queryFilters, page, pageSize, storedMonth, setParams])

  // A shared ?month= link adopts the month into the global period (invalid
  // values are ignored by the hook). Runs once on mount.
  const adoptedUrlMonth = useMemo(() => params.get('month'), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (adoptedUrlMonth) setGlobalMonth(adoptedUrlMonth)
  }, [adoptedUrlMonth, setGlobalMonth])

  // The header period is the single source of truth: it drives Transactions,
  // WHT and Metrics together. resolvePeriod owns the rule so it stays testable
  // outside React.
  //
  // The first pass honours whatever the URL said — a shared link may carry a
  // custom range, and a bare re-render must not wipe it. Every later change to
  // the global month is an explicit pick, which supersedes a local range:
  // "show me October" cannot mean "October, except the range I set here".
  const syncedPeriod = useRef(false)
  useEffect(() => {
    const explicitPick = syncedPeriod.current
    // Set outside the state updater: updaters must stay pure, and React may
    // invoke them more than once.
    syncedPeriod.current = true
    setFilters((f) => {
      const next = resolvePeriod(f, globalMonth, { explicitPick })
      return next.month === f.month && next.from === f.from && next.to === f.to ? f : { ...f, ...next }
    })
  }, [globalMonth])

  // Any change to what is being filtered sends the user back to page 1 and
  // drops the selection: rows selected under the old filter are no longer part
  // of the result set, so a bulk action would be acting on something invisible.
  // Paging is deliberately NOT a reset — selection is expected to span pages,
  // which is what "select all N matching" relies on.
  const filterSignature = JSON.stringify(queryFromFilters(filters))
  useEffect(() => {
    setPage(0)
  }, [filterSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isFetching, isError, error, refetch } = useTransactions(queryFilters, page, pageSize)
  const rows = data?.rows ?? []
  const totals = data?.totals
  const total = data?.total ?? 0

  useEffect(() => {
    setSelected(new Set())
  }, [filterSignature])

  // The server clamps what it returns; mirror that so the UI never sits on a
  // page that does not exist (e.g. after deleting the last row on page 3).
  useEffect(() => {
    const safe = clampPage(page, total, pageSize)
    if (safe !== page) setPage(safe)
  }, [page, total, pageSize])

  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()
  const vendors = useAllVendors()

  // The full filtered set is only fetched when something actually needs it:
  // a cross-page bulk action, "select all matching", or a CSV export. Selecting
  // a single row counts, because the selection may span pages the user cannot
  // see — resolving a selection against the current page alone would silently
  // drop rows the user believes they picked.
  const [needAll, setNeedAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const wantFullSet = needAll || exporting || selected.size > 0
  const { data: allRows, isFetching: allFetching } = useAllTransactions(queryFilters, wantFullSet)

  const attentionCount = useMemo(() => rows.filter((t) => attentionFor(t)).length, [rows])
  // The pill is page-scoped, so it is redundant (and would double-count) when
  // the attention filter is already narrowing the list — there the filtered
  // count IS the queue size.
  const attentionOnPage = queryFilters.attention ? 0 : attentionCount

  const activeFilters = useMemo(
    () =>
      describeActiveFilters(queryFilters, {
        vendorName: (id) => vendors.find((v) => v.id === id)?.name ?? id,
      }),
    [queryFilters, vendors],
  )

  const set = useCallback((patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
  }, [])

  // A custom range is a LIST-LOCAL override. It deliberately leaves the header
  // period alone: narrowing this list must not silently re-point WHT and
  // Metrics at "all time". The list shows an explicit notice while decoupled
  // (see CustomRangeNotice) so the difference is never a mystery.
  const setRange = useCallback(
    (patch: Partial<TransactionFilters>) => {
      set({ ...patch, month: '' })
    },
    [set],
  )
  const applyPreset = useCallback(
    (id: PresetId) => {
      set({ ...presetRange(id), month: '' })
    },
    [set],
  )

  // Hand the view back to the header period.
  const useHeaderPeriod = useCallback(() => {
    setFilters((f) => {
      const next = resolvePeriod(f, globalMonth)
      return { ...f, ...next }
    })
  }, [globalMonth])

  const clearFilter = useCallback(
    (key: ActiveFilter['key']) => {
      if (key === 'search') setSearch('')
      if (key === 'from' || key === 'to') {
        // Clearing the range hands the view back to the header period.
        setFilters((f) => {
          const cleared = { ...f, from: '', to: '', month: '' }
          return { ...cleared, ...resolvePeriod(cleared, globalMonth) }
        })
        return
      }
      set({ [key]: '' } as Partial<TransactionFilters>)
    },
    [set, globalMonth],
  )

  // "Clear all filters" resets the LIST and returns it to the header period —
  // it does not clear the app-wide period, which belongs to the header control.
  const clearAll = useCallback(() => {
    setSearch('')
    setFilters({ ...emptyFilters(), month: globalMonth })
  }, [globalMonth])

  const open = useCallback((id: string) => nav(`/transactions/${id}`), [nav])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const ids = rows.map((r) => r.id)
      const allOn = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)))
      return next
    })
  }, [rows])

  // Selection can span pages, so bulk actions resolve ids against the full set.
  // While that set is still in flight the selection is only partially
  // resolvable, so the actions wait rather than quietly acting on the page.
  const fullSetReady = !!allRows
  const selectedRows = useCallback((): PaymentTransaction[] => {
    if (!allRows) return []
    return allRows.filter((t) => selected.has(t.id))
  }, [allRows, selected])

  const loadAllForSelection = useCallback(() => {
    setNeedAll(true)
  }, [])

  // Once the full set has loaded, a cross-page "select all" can be applied.
  useEffect(() => {
    if (needAll && allRows) {
      setSelected(new Set(allRows.map((t) => t.id)))
      setNeedAll(false)
    }
  }, [needAll, allRows])

  const copyLinks = useCallback(async () => {
    if (!fullSetReady) {
      toast.show('กำลังโหลดรายการที่เลือก…', 'info')
      return
    }
    const links = selectedRows()
      .map((t) => inviteUrl(t.inviteToken))
      .filter(Boolean)
    if (links.length === 0) {
      toast.show('ไม่มีรายการที่มีลิงก์ผู้ขาย', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(links.join('\n'))
      toast.show(`คัดลอกลิงก์ ${links.length} รายการแล้ว`)
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
  }, [fullSetReady, selectedRows, toast])

  const saveCsv = useCallback(
    (pool: PaymentTransaction[]) => {
      const period = queryFilters.month || [queryFilters.from, queryFilters.to].filter(Boolean).join('..') || undefined
      downloadCsv(downloadName({ kind: 'transactions', clientCode: cfg.clientCode, period, ext: 'csv' }), txnsToCsv(pool))
      toast.show(`ส่งออก ${pool.length} รายการแล้ว`)
    },
    [toast, queryFilters.month, queryFilters.from, queryFilters.to, cfg.clientCode],
  )

  const exportSelected = useCallback(() => {
    if (!fullSetReady) {
      toast.show('กำลังโหลดรายการที่เลือก…', 'info')
      return
    }
    const pool = selectedRows()
    if (pool.length === 0) {
      toast.show('กรุณาเลือกรายการก่อนส่งออก', 'error')
      return
    }
    saveCsv(pool)
  }, [fullSetReady, selectedRows, saveCsv, toast])

  // Exporting the whole filtered set needs every row, which is not loaded for
  // the page. Ask for it once; the effect below writes the file when it lands,
  // so the click never hangs with no feedback.
  const exportAll = useCallback(() => {
    if (allRows) {
      saveCsv(allRows)
      return
    }
    setExporting(true)
    toast.show('กำลังเตรียมข้อมูลเพื่อส่งออก…', 'info')
  }, [allRows, saveCsv, toast])

  useEffect(() => {
    if (!exporting || !allRows) return
    saveCsv(allRows)
    setExporting(false)
  }, [exporting, allRows, saveCsv])

  const toggleDense = useCallback(() => {
    setDense((d) => {
      const next = !d
      try {
        localStorage.setItem(DENSE_KEY, next ? '1' : '0')
      } catch {
        /* persistence is best-effort */
      }
      return next
    })
  }, [])

  // Keyboard shortcuts: "/" focuses search, "f" toggles the filter panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'f') {
        e.preventDefault()
        setShowPanel((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const selectedLinkCount = useMemo(
    () => (allRows ?? rows).filter((t) => selected.has(t.id) && t.inviteToken).length,
    [allRows, rows, selected],
  )
  // Offer "select all matching" only while some matching row is NOT selected.
  const canSelectAll = total > rows.length && selected.size < total

  const filtered = activeFilterCount(queryFilters) > 0 || !!queryFilters.search.trim()
  const isEmpty = !isLoading && !isError && rows.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="รายการธุรกรรมผู้ขาย"
        sub="สร้างรายการ · ส่งลิงก์ทาง LINE · ติดตามสถานะจนออกใบเสร็จ"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={exportAll}
              loading={allFetching}
              title="ส่งออก CSV ทุกรายการที่ตรงเงื่อนไข (ต้องมี UTF-8 BOM เพื่อให้ Excel อ่านภาษาไทยได้)"
            >
              <Download size={16} aria-hidden /> ส่งออก CSV
            </Button>
            <button
              type="button"
              onClick={toggleDense}
              aria-pressed={dense}
              title={dense ? 'เปลี่ยนเป็นแถวสูง (อ่านง่ายขึ้น)' : 'เปลี่ยนเป็นแถวกระชับ (เห็นข้อมูลมากขึ้น)'}
              aria-label="สลับความหนาแน่นของตาราง"
              className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-card-border bg-white text-ink-600 transition hover:bg-ink-100"
            >
              {dense ? <Rows3 size={17} aria-hidden /> : <Rows4 size={17} aria-hidden />}
            </button>
            <Link to="/transactions/new">
              <Button>
                <Plus size={17} aria-hidden /> สร้างรายการใหม่
              </Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardBody>
          <TxnToolbar
            filters={queryFilters}
            search={search}
            onSearch={setSearch}
            onPatch={set}
            onTogglePanel={() => setShowPanel((v) => !v)}
            panelOpen={showPanel}
            active={activeFilters}
            searchRef={searchRef}
            chips={STATUS_CHIPS}
            onClearFilter={clearFilter}
          />
          {showPanel && (
            <TxnFiltersPanel
              id="txn-filter-panel"
              filters={filters}
              paymentTypes={cfg.paymentTypes}
              vendors={vendors}
              onPatch={set}
              onRange={setRange}
              onPreset={applyPreset}
              onClearAll={clearAll}
            />
          )}
        </CardBody>
      </Card>

      {/* A decoupled view says so, instead of leaving the header looking ignored. */}
      <CustomRangeNotice
        filters={queryFilters}
        globalMonth={globalMonth}
        onUsePeriod={useHeaderPeriod}
        onClearRange={() => clearFilter('from')}
      />

      {/* Totals describe the whole filtered set, above the table — the previous
          layout buried them in a tfoot inside a scrolling region. */}
      {totals && (
        <SummaryBar totals={totals} attentionOnPage={attentionOnPage} loading={isLoading} />
      )}

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="โหลดรายการธุรกรรมไม่สำเร็จ"
            description={
              error instanceof Error && error.message
                ? `รายละเอียด: ${error.message}`
                : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'
            }
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            <TxnTableFrame fetching={isFetching && !isLoading}>
              <TxnTable
                rows={rows}
                sort={queryFilters.sort}
                onSort={(k: SortKey) => set({ sort: k })}
                selected={selected}
                onToggle={toggle}
                onTogglePage={togglePage}
                onOpen={open}
                loading={isLoading}
                dense={dense}
              />
            </TxnTableFrame>

            {isEmpty &&
              (filtered ? (
                <EmptyState
                  icon={FileSearch}
                  title="ไม่พบรายการตามเงื่อนไข"
                  description="ลองปรับหรือล้างตัวกรองเพื่อดูรายการเพิ่มเติม"
                  action={
                    <Button variant="secondary" onClick={clearAll}>
                      ล้างตัวกรองทั้งหมด
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FileSearch}
                  title="ยังไม่มีรายการในรอบนี้"
                  description="สร้างรายการแรกเพื่อเริ่มออกใบเสร็จรับเงินให้ผู้ขายรายย่อย"
                  action={
                    <Link to="/transactions/new">
                      <Button>
                        <Plus size={17} aria-hidden /> สร้างรายการใหม่
                      </Button>
                    </Link>
                  }
                />
              ))}

            {selected.size > 0 && canSelectAll && (
              <SelectAllMatching
                total={total}
                onSelectAll={() => {
                  loadAllForSelection()
                  toast.show('กำลังเลือกทุกรายการที่ตรงเงื่อนไข…', 'info')
                }}
              />
            )}

            <TxnBulkBar
              count={selected.size}
              linkCount={selectedLinkCount}
              onCopyLinks={() => void copyLinks()}
              onExport={exportSelected}
              onClear={() => setSelected(new Set())}
            />

            {!isLoading && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                busy={isFetching}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size)
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

