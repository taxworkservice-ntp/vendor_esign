import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronRight, Download, Plus, RotateCcw, Search, Users, X } from 'lucide-react'
import { useSetVendorActive, useVendors, type VendorSort } from '../hooks/useVendors'
import { useDebounced } from '../hooks/useDebounced'
import { displayTaxId } from '../lib/vendors-mock'
import { vendorDisplayName } from '../lib/vendor-name'
import { fmtDateTH, fmtTHB } from '../lib/format'
import { downloadCsv, exportFilename, toCsv, withBom, type CsvColumn } from '../lib/csv'
import type { ClientVendor } from '../lib/vendors-mock'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { useToast } from '../components/ui/toast'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { cn } from '../lib/cn'

// Supplier register.
//
// Three things this page did not have before, all of which a payables register
// is actually for:
//
//  1. Money. Outstanding balance, transaction count and last activity, joined in
//     by the endpoint. A list of names and tax IDs told you nothing about who
//     you owe.
//  2. Keyboard access. Rows were <tr onClick> with no tabIndex or key handler,
//     so a keyboard user could not open a supplier at all — only the name link
//     was focusable.
//  3. An honest empty state. "ยังไม่มีผู้ขาย" appeared both when the register was
//     empty and when a search matched nothing, and there was no error state, so
//     a failed fetch looked like an empty register.
//
// A supplier register is bounded by the supplier count, so it is fetched whole
// and filtered locally (see useVendors) — the search reaches the last 4 digits
// of a tax ID, which server-side pushdown cannot, because the stored number is
// encrypted. Debouncing is what keeps that affordable.

const thCls =
  'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-4 py-2.5 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

const SORTS: { v: VendorSort; th: string }[] = [
  { v: 'recent', th: 'เพิ่มล่าสุด' },
  { v: 'name', th: 'ชื่อ ก-ฮ' },
  { v: 'outstanding', th: 'ยอดค้างชำระมากที่สุด' },
  { v: 'activity', th: 'เคลื่อนไหวล่าสุด' },
]

const CSV_COLUMNS: CsvColumn<ClientVendor>[] = [
  { header: 'รหัสผู้ขาย', value: (v) => String(v.vendorNo ?? 0).padStart(3, '0'), text: false },
  { header: 'คำนำหน้าชื่อ', value: (v) => v.prefix ?? '' },
  { header: 'ชื่อ', value: (v) => v.name },
  { header: 'ที่อยู่', value: (v) => v.address },
  { header: 'เลขประจำตัวผู้ขาย', value: (v) => v.taxLast4 ? `x-xxxx-xxxxx-${v.taxLast4.slice(0, 2)}-${v.taxLast4.slice(2)}` : '' },
  { header: 'LINE user id', value: (v) => v.lineUserId ?? '', text: false },
  { header: 'โทรศัพท์', value: (v) => v.phone ?? '', text: false },
  { header: 'อีเมล', value: (v) => v.email ?? '' },
  { header: 'จำนวนรายการ', value: (v) => v.txnCount ?? 0, text: false },
  { header: 'ยอดค้างชำระ (บาท)', value: (v) => v.outstanding ?? 0, text: false },
  { header: 'เคลื่อนไหวล่าสุด', value: (v) => v.lastActivity ?? '', text: false },
  { header: 'สถานะ', value: (v) => (v.isActive === false ? 'ปิดใช้งาน' : 'ใช้งาน') },
]

export function VendorsList() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<VendorSort>('recent')
  const [showArchived, setShowArchived] = useState(false)
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null)
  const debouncedSearch = useDebounced(search, 250)
  const { data, isLoading, isFetching, isError, error, refetch } = useVendors(debouncedSearch, sort, showArchived)
  const setActive = useSetVendorActive()
  const nav = useNavigate()
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const vendors = useMemo(() => data ?? [], [data])
  const totalOutstanding = useMemo(
    () => vendors.reduce((s, v) => s + (v.outstanding ?? 0), 0),
    [vendors],
  )

  const open = useCallback((id: string) => nav(`/vendors/${id}`), [nav])

  const onRowKey = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open(id)
      }
    },
    [open],
  )

  // Archiving drops the supplier out of the register, and a mis-click would make
  // a vendor you still transact with quietly unavailable — so that direction
  // asks first. Restoring is trivially reversible, so confirming it would only
  // add friction.
  const toggleActive = useCallback(
    (v: { id: string; name: string; isActive?: boolean }) => {
      if (v.isActive === false) {
        void setActive.mutateAsync(
          { id: v.id, isActive: true },
          {
            onSuccess: () => toast.show(`เปิดการใช้งาน ${v.name} แล้ว`),
            onError: () => toast.show('อัปเดตสถานะผู้ขายไม่สำเร็จ', 'error'),
          },
        )
        return
      }
      setPendingArchive({ id: v.id, name: v.name })
    },
    [setActive, toast],
  )

  const exportCsv = useCallback(() => {
    if (vendors.length === 0) {
      toast.show('ไม่มีรายการให้ส่งออก', 'error')
      return
    }
    downloadCsv(`vendors-${exportFilename().replace(/^transactions-/, '')}`, withBom(toCsv(vendors, CSV_COLUMNS)))
    toast.show(`ส่งออกทะเบียนผู้ขาย ${vendors.length} รายการแล้ว`)
  }, [vendors, toast])

  const filtered = debouncedSearch.trim() !== ''
  const isEmpty = !isLoading && !isError && vendors.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="ผู้ขาย"
        sub="ทะเบียนผู้ขายรายย่อย (ไม่จด VAT) — ใช้สำหรับออกใบเสร็จรับเงิน"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={vendors.length === 0} title="ส่งออกทะเบียนผู้ขายเป็น CSV">
              <Download size={16} aria-hidden /> ส่งออก CSV
            </Button>
            <Link to="/vendors/new">
              <Button>
                <Plus size={17} /> เพิ่มผู้ขาย
              </Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="vendor-search" className="sr-only">
                ค้นหาผู้ขาย
              </label>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input
                id="vendor-search"
                ref={searchRef}
                className={cn('pl-10', search && 'pr-10')}
                placeholder="ค้นหาชื่อ / ที่อยู่ / เลขบัตร 4 หลักท้าย / เบอร์โทร / รหัสผู้ขาย…"
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

            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap text-label text-ink-500">เรียงตาม</span>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as VendorSort)}
                aria-label="เรียงลำดับรายการผู้ขาย"
                className="h-9 w-auto min-w-44"
              >
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.th}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-card-border pt-3 text-label">
            <span className="text-ink-500" aria-live="polite">
              {isLoading ? 'กำลังโหลด…' : `${vendors.length.toLocaleString('th-TH')} รายการ`}
            </span>
            {totalOutstanding > 0 && (
              <span className="text-ink-600">
                ยอดค้างชำระรวม <b className="tabular-nums">{fmtTHB(totalOutstanding)}</b> บาท
              </span>
            )}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-ink-900"
              />
              แสดงผู้ขายที่ปิดใช้งาน
            </label>
            {filtered && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
              >
                <RotateCcw size={13} aria-hidden /> ล้างคำค้นหา
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="โหลดทะเบียนผู้ขายไม่สำเร็จ"
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
                  aria-label="กำลังโหลดทะเบียนผู้ขาย"
                >
                  <div className="h-full w-1/3 animate-pulse bg-primary" />
                </div>
              )}
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[900px] border-collapse text-body">
                  <thead>
                    <tr>
                      <th scope="col" className={thCls}>
                        ผู้ขาย
                      </th>
                      <th scope="col" className={thCls}>
                        เลขบัตรประชาชน
                      </th>
                      <th scope="col" className={cn(thCls, 'text-right')}>
                        จำนวนรายการ
                      </th>
                      <th scope="col" className={cn(thCls, 'text-right')}>
                        ยอดค้างชำระ
                      </th>
                      <th scope="col" className={cn(thCls, 'text-right')}>
                        เคลื่อนไหวล่าสุด
                      </th>
                      <th scope="col" className={cn(thCls, 'w-24 text-right')}>
                        <span className="sr-only">จัดการ</span>
                      </th>
                      <th scope="col" className={cn(thCls, 'w-10')}>
                        <span className="sr-only">เปิด</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={6} cols={7} />
                    ) : (
                      vendors.map((v) => {
                        const archived = v.isActive === false
                        return (
                          <tr
                            key={v.id}
                            // The row is the click target, so it carries the
                            // link semantics and the keyboard handler. Without
                            // this a keyboard user could not open a supplier.
                            role="link"
                            tabIndex={0}
                            aria-label={`เปิดผู้ขาย ${vendorDisplayName(v.prefix, v.name)}`}
                            onClick={() => open(v.id)}
                            onKeyDown={(e) => onRowKey(e, v.id)}
                            className={cn(
                              'cursor-pointer border-b border-card-border transition last:border-0 hover:bg-ink-50 focus:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900',
                              archived && 'opacity-60',
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-baseline gap-2">
                                <span className="shrink-0 font-mono text-label text-ink-400">
                                  #{String(v.vendorNo ?? 0).padStart(3, '0')}
                                </span>
                                <Link
                                  to={`/vendors/${v.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate font-semibold leading-snug hover:underline"
                                >
                                  {vendorDisplayName(v.prefix, v.name)}
                                </Link>
                                {archived && (
                                  <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-micro font-semibold text-ink-500">
                                    ปิดใช้งาน
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-body text-ink-500">{v.address}</p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono">{displayTaxId(v)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-600">
                              {v.txnCount ? v.txnCount.toLocaleString('th-TH') : '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                              {v.outstanding ? fmtTHB(v.outstanding) : <span className="font-sans font-normal text-ink-400">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-600">
                              {v.lastActivity ? fmtDateTH(v.lastActivity) : '—'}
                            </td>
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => toggleActive(v)}
                                title={archived ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน (ซ่อนจากทะเบียน แต่เอกสารเดิมยังอยู่)'}
                                aria-label={
                                  archived
                                    ? `เปิดการใช้งาน ${vendorDisplayName(v.prefix, v.name)}`
                                    : `ปิดการใช้งาน ${vendorDisplayName(v.prefix, v.name)}`
                                }
                                className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                              >
                                {archived ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-ink-400">
                              <ChevronRight size={16} aria-hidden />
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
                  icon={Search}
                  title="ไม่พบผู้ขายที่ค้นหา"
                  description={`ไม่มีผู้ขายที่ตรงกับ “${debouncedSearch}” — ลองค้นด้วยชื่อ เลขบัตร 4 หลักท้าย หรือเบอร์โทร`}
                  action={
                    <Button variant="secondary" onClick={() => setSearch('')}>
                      ล้างคำค้นหา
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="ยังไม่มีผู้ขาย"
                  description="เพิ่มผู้ขายรายใหม่เพื่อเริ่มออกใบเสร็จรับเงิน"
                  action={
                    <Link to="/vendors/new">
                      <Button>
                        <Plus size={17} /> เพิ่มผู้ขาย
                      </Button>
                    </Link>
                  }
                />
              ))}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pendingArchive !== null}
        title="ยืนยันการปิดการใช้งานผู้ขาย"
        message={
          <>
            ต้องการปิดการใช้งาน “<b>{pendingArchive?.name}</b>” ใช่หรือไม่
            <br />
            <span className="text-body text-ink-500">
              ผู้ขายรายนี้จะถูกซ่อนจากทะเบียน แต่เอกสารเดิมทั้งหมดยังอยู่ครบ
              และเปิดใช้งานกลับได้ภายหลัง
            </span>
          </>
        }
        confirmLabel="ปิดการใช้งาน"
        // Reversible, so a red button would overstate the risk.
        tone="primary"
        busy={setActive.isPending}
        onConfirm={() => {
          const target = pendingArchive
          setPendingArchive(null)
          if (!target) return
          void setActive.mutateAsync(
            { id: target.id, isActive: false },
            {
              onSuccess: () => toast.show(`ปิดการใช้งาน ${target.name} แล้ว`),
              onError: () => toast.show('อัปเดตสถานะผู้ขายไม่สำเร็จ', 'error'),
            },
          )
        }}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  )
}
