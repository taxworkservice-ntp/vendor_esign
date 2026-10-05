import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronRight, Download, Plus, Search, Users } from 'lucide-react'
import { useSetVendorActive, useVendors, type VendorSort } from '../hooks/useVendors'
import { useDebounced } from '../hooks/useDebounced'
import { displayTaxId } from '../lib/vendors-mock'
import { vendorDisplayName } from '../lib/vendor-name'
import { vendorCode } from '../lib/ids'
import { fmtDateTH, fmtTHB } from '../lib/format'
import { downloadCsv, toCsv, withBom, type CsvColumn } from '../lib/csv'
import { downloadName } from '../lib/download-name'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import type { ClientVendor } from '../lib/vendors-mock'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { useToast } from '../components/ui/toast'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { RegistryToolbar, type SortOption } from '../components/ui/registry-toolbar'
import { ClickableRow, LoadingBar, RegistryId, Td, Th, tableCls } from '../components/ui/data-table'
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

const SORTS: SortOption<VendorSort>[] = [
  { v: 'recent', th: 'เพิ่มล่าสุด' },
  { v: 'name', th: 'ชื่อ ก-ฮ' },
  { v: 'outstanding', th: 'ยอดค้างชำระมากที่สุด' },
  { v: 'activity', th: 'เคลื่อนไหวล่าสุด' },
]

const CSV_COLUMNS: CsvColumn<ClientVendor>[] = [
  { header: 'รหัสผู้ขาย', value: (v) => vendorCode(v.vendorNo) },
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
  const { data: settings } = useSettings()
  const clientCode = (settings ?? defaultSettings()).clientCode

  const vendors = useMemo(() => data ?? [], [data])
  const totalOutstanding = useMemo(
    () => vendors.reduce((s, v) => s + (v.outstanding ?? 0), 0),
    [vendors],
  )

  const open = useCallback((id: string) => nav(`/vendors/${id}`), [nav])

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
    downloadCsv(downloadName({ kind: 'vendors', clientCode, ext: 'csv' }), withBom(toCsv(vendors, CSV_COLUMNS)))
    toast.show(`ส่งออกทะเบียนผู้ขาย ${vendors.length} รายการแล้ว`)
  }, [vendors, toast, clientCode])

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
        <CardBody>
          <RegistryToolbar
            searchId="vendor-search"
            search={search}
            onSearch={setSearch}
            placeholder="ค้นหาชื่อ / ที่อยู่ / เลขบัตร 4 หลักท้าย / เบอร์โทร / รหัสผู้ขาย…"
            inputRef={searchRef}
            sort={sort}
            onSort={setSort}
            sorts={SORTS}
            sortAriaLabel="เรียงลำดับรายการผู้ขาย"
            archived={showArchived}
            onArchived={setShowArchived}
            archivedLabel="แสดงผู้ขายที่ปิดใช้งาน"
            count={vendors.length}
            loading={isLoading}
            extra={
              totalOutstanding > 0 ? (
                <span className="text-ink-600">
                  ยอดค้างชำระรวม <b className="tabular-nums">{fmtTHB(totalOutstanding)}</b> บาท
                </span>
              ) : undefined
            }
            onClear={() => setSearch('')}
          />
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
              <LoadingBar show={isFetching && !isLoading} label="กำลังโหลดทะเบียนผู้ขาย" />
              <div className="max-h-[70vh] overflow-auto">
                <table className={cn(tableCls, 'min-w-[960px]')}>
                  <thead>
                    <tr>
                      <Th className="w-28">รหัส</Th>
                      <Th>ผู้ขาย</Th>
                      <Th>เลขบัตรประชาชน</Th>
                      <Th align="right">จำนวนรายการ</Th>
                      <Th align="right">ยอดค้างชำระ</Th>
                      <Th align="right">เคลื่อนไหวล่าสุด</Th>
                      <Th align="right" className="w-24">
                        <span className="sr-only">จัดการ</span>
                      </Th>
                      <Th className="w-10">
                        <span className="sr-only">เปิด</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={6} cols={8} />
                    ) : (
                      vendors.map((v) => {
                        const archived = v.isActive === false
                        const name = vendorDisplayName(v.prefix, v.name)
                        return (
                          <ClickableRow key={v.id} label={`เปิดผู้ขาย ${name}`} archived={archived} onOpen={() => open(v.id)}>
                            <Td>
                              <RegistryId code={vendorCode(v.vendorNo)} />
                            </Td>
                            <Td>
                              <div className="flex items-baseline gap-2">
                                <Link
                                  to={`/vendors/${v.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate font-semibold leading-snug hover:underline"
                                >
                                  {name}
                                </Link>
                                {archived && (
                                  <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-micro font-medium text-ink-500">
                                    ปิดใช้งาน
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-body text-ink-500">{v.address}</p>
                            </Td>
                            <Td className="whitespace-nowrap font-mono">{displayTaxId(v)}</Td>
                            <Td align="right" className="whitespace-nowrap tabular-nums text-ink-600">
                              {v.txnCount ? v.txnCount.toLocaleString('th-TH') : '—'}
                            </Td>
                            <Td align="right" className="whitespace-nowrap font-semibold tabular-nums">
                              {v.outstanding ? fmtTHB(v.outstanding) : <span className="font-sans font-normal text-ink-400">—</span>}
                            </Td>
                            <Td align="right" className="whitespace-nowrap tabular-nums text-ink-600">
                              {v.lastActivity ? fmtDateTH(v.lastActivity) : '—'}
                            </Td>
                            <Td className="px-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => toggleActive(v)}
                                  title={archived ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน (ซ่อนจากทะเบียน แต่เอกสารเดิมยังอยู่)'}
                                  aria-label={archived ? `เปิดการใช้งาน ${name}` : `ปิดการใช้งาน ${name}`}
                                  className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                >
                                  {archived ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                                </button>
                              </div>
                            </Td>
                            <Td className="px-2 text-ink-400">
                              <ChevronRight size={16} aria-hidden />
                            </Td>
                          </ClickableRow>
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
                  description={`ไม่มีผู้ขายที่ตรงกับ “${debouncedSearch}” — ลองค้นด้วยชื่อ เลขบัตร 4 หลักท้าย เบอร์โทร หรือรหัสผู้ขาย`}
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
