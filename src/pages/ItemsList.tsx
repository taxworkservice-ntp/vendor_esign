import { useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useDeleteItem, useItems, useSetItemActive } from '../hooks/useItems'
import { useClientAuth } from '../lib/client-auth'
import { useColumnSort } from '../hooks/useColumnSort'
import { sortRows, type SortAccessor } from '../lib/sort'
import type { CatalogItem } from '../lib/items-mock'
import { useDebounced } from '../hooks/useDebounced'
import { itemCode } from '../lib/ids'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { useToast } from '../components/ui/toast'
import { RegistryToolbar } from '../components/ui/registry-toolbar'
import { LoadingBar, RegistryId, Row, SortableTh, Td, Th, tableCls } from '../components/ui/data-table'
import { ItemFormDialog } from '../components/items/item-form-dialog'
import { fmtTHB } from '../lib/format'
import { downloadCsv, itemsToCsv } from '../lib/csv'
import { downloadName } from '../lib/download-name'
import { defaultSettings, whtRateFor } from '../lib/settings'
import { useSettings } from '../hooks/useSettings'
import { cn } from '../lib/cn'

// Service catalogue.
//
// The create form used to be a permanent card above the list, taking roughly
// 200px before a single row was visible on every visit. It now sits behind a
// button and stays open while editing, so the flow is uninterrupted.
//
// Two data-quality fixes came with it: names are unique per workspace
// (migration 015, mirrored on the mock), because a duplicate service becomes
// the default line item in new transactions; and `is_active` — which has
// existed in the schema since 008 but was never read by anything — is now the
// archive flag, so an entry can be retired without being deleted.

const ITEM_SORT: Record<string, SortAccessor<CatalogItem>> = {
  code: (it) => it.itemNo,
  name: (it) => it.name,
  unit: (it) => it.unit ?? '',
  unitPrice: (it) => it.unitPrice,
}

export function ItemsList() {
  // Display-only mirrors of the server gates (hidden actions still 403).
  const { can } = useClientAuth()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const { key: sortKey, dir: sortDir, onSort } = useColumnSort('code', 'asc')
  const debouncedSearch = useDebounced(search, 250)
  const { data, isLoading, isFetching, isError, error, refetch } = useItems(debouncedSearch, 'recent', showArchived)
  const del = useDeleteItem()
  const setActive = useSetItemActive()
  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()
  const rateOf = (paymentType?: string) => whtRateFor(paymentType ?? '', cfg)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null)
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => sortRows(data ?? [], sortKey, sortDir, ITEM_SORT), [data, sortKey, sortDir])

  const openCreate = () => {
    setEditItem(null)
    setDialogOpen(true)
  }
  const openEdit = (it: CatalogItem) => {
    setEditItem(it)
    setDialogOpen(true)
  }

  const exportCsv = () => {
    if (items.length === 0) {
      toast.show('ไม่มีรายการให้ส่งออก', 'error')
      return
    }
    downloadCsv(downloadName({ kind: 'items', clientCode: cfg.clientCode, ext: 'csv' }), itemsToCsv(items))
    toast.show(`ส่งออก ${items.length} รายการแล้ว`)
  }

  // Archiving hides the entry from the catalogue, and a mis-click would make a
  // service the user still needs quietly disappear from the picker — so that
  // direction asks first. Restoring is trivially reversible, so confirming it
  // would be friction for no benefit.
  const toggleActive = (it: { id: string; name: string; isActive?: boolean }) => {
    if (it.isActive === false) {
      void setActive.mutateAsync(
        { id: it.id, isActive: true },
        {
          onSuccess: () => toast.show(`เปิดการใช้งาน “${it.name}” แล้ว`),
          onError: () => toast.show('อัปเดตสถานะไม่สำเร็จ', 'error'),
        },
      )
      return
    }
    setPendingArchive({ id: it.id, name: it.name })
  }

  const filtered = debouncedSearch.trim() !== ''
  const isEmpty = !isLoading && !isError && items.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="สินค้า / บริการ"
        sub="รายการสินค้าและบริการ สำหรับเรียกใช้เมื่อสร้างธุรกรรม (รหัส · ชื่อ · หน่วย · ราคา)"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={items.length === 0}>
              ส่งออก CSV
            </Button>
            {can('canManageCatalog') && (
              <Button onClick={openCreate}>
                <Plus size={17} /> เพิ่มรายการใหม่
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardBody>
          <RegistryToolbar
            searchId="item-search"
            search={search}
            onSearch={setSearch}
            placeholder="ค้นหาชื่อรายการ / หน่วย / รหัส (ITM-001)…"
            inputRef={searchRef}
            archived={showArchived}
            onArchived={setShowArchived}
            archivedLabel="แสดงรายการที่ปิดใช้งาน"
            count={items.length}
            loading={isLoading}
            onClear={() => setSearch('')}
          />
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="โหลดรายการสินค้า/บริการไม่สำเร็จ"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            <div className="relative">
              <LoadingBar show={isFetching && !isLoading} label="กำลังโหลดรายการสินค้า" />
              <div className="max-h-[65vh] overflow-auto">
                <table className={cn(tableCls, 'min-w-[760px]')}>
                  <thead>
                    <tr>
                      <SortableTh label="รหัส" className="w-28" active={sortKey === 'code'} dir={sortDir} onSort={() => onSort('code')} />
                      <SortableTh label="รายการ" active={sortKey === 'name'} dir={sortDir} onSort={() => onSort('name')} />
                      <SortableTh label="หน่วย" active={sortKey === 'unit'} dir={sortDir} onSort={() => onSort('unit')} />
                      <SortableTh label="ราคา" align="right" active={sortKey === 'unitPrice'} dir={sortDir} onSort={() => onSort('unitPrice')} />
                      <Th>ประเภทภาษี</Th>
                      <Th align="right" className="w-32">
                        <span className="sr-only">จัดการ</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={6} cols={6} />
                    ) : (
                      items.map((it) => {
                        const archived = it.isActive === false
                        return (
                          <Row key={it.id} archived={archived}>
                            <Td>
                              <RegistryId code={itemCode(it.itemNo)} />
                            </Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold">{it.name}</span>
                                {archived && (
                                  <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-micro font-medium text-ink-500">
                                    ปิดใช้งาน
                                  </span>
                                )}
                              </div>
                            </Td>
                            <Td className="text-ink-500">{it.unit || '—'}</Td>
                            <Td align="right" className="tabular-nums">{fmtTHB(it.unitPrice)}</Td>
                            <Td className="whitespace-nowrap text-body">
                              {it.paymentType ? (
                                <span>{it.paymentType} <span className="text-ink-500 tabular-nums">{rateOf(it.paymentType)}%</span></span>
                              ) : (
                                <span className="text-warning">รอตั้งค่าภาษี</span>
                              )}
                            </Td>
                            <Td className="px-2">
                              <div className="flex items-center justify-end gap-1">
                                {can('canManageCatalog') && (
                                  <button
                                    type="button"
                                    onClick={() => toggleActive(it)}
                                    title={archived ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน (ซ่อนจากรายการ แต่เอกสารเดิมยังอยู่)'}
                                    aria-label={archived ? `เปิดการใช้งาน ${it.name}` : `ปิดการใช้งาน ${it.name}`}
                                    className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                  >
                                    {archived ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                                  </button>
                                )}
                                {can('canManageCatalog') && (
                                  <button
                                    type="button"
                                    onClick={() => openEdit(it)}
                                    className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                    title="แก้ไข"
                                    aria-label={`แก้ไข ${it.name}`}
                                  >
                                    <Pencil size={15} aria-hidden />
                                  </button>
                                )}
                                {can('canDeleteDocuments') && (
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete({ id: it.id, name: it.name })}
                                    className="grid h-8 w-8 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-danger"
                                    title="ลบถาวร"
                                    aria-label={`ลบ ${it.name}`}
                                  >
                                    <Trash2 size={15} aria-hidden />
                                  </button>
                                )}
                              </div>
                            </Td>
                          </Row>
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
                  title="ไม่พบรายการที่ค้นหา"
                  description={`ไม่มีรายการที่ตรงกับ “${debouncedSearch}”`}
                  action={
                    <Button variant="secondary" onClick={() => setSearch('')}>
                      ล้างคำค้นหา
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Package}
                  title="ยังไม่มีรายการสินค้า/บริการ"
                  description="เพิ่มรายการเพื่อเรียกใช้เมื่อสร้างธุรกรรม"
                  action={
                    can('canManageCatalog') && (
                      <Button onClick={openCreate}>
                        <Plus size={17} /> เพิ่มรายการใหม่
                      </Button>
                    )
                  }
                />
              ))}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pendingArchive !== null}
        title="ยืนยันการปิดการใช้งาน"
        message={
          <>
            ต้องการปิดการใช้งาน “<b>{pendingArchive?.name}</b>” ใช่หรือไม่
            <br />
            <span className="text-body text-ink-500">
              รายการนี้จะถูกซ่อนจากรายการสินค้า/บริการ แต่เอกสารที่เคยใช้ยังอยู่ครบ
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
              onSuccess: () => toast.show(`ปิดการใช้งาน “${target.name}” แล้ว`),
              onError: () => toast.show('อัปเดตสถานะไม่สำเร็จ', 'error'),
            },
          )
        }}
        onCancel={() => setPendingArchive(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบรายการ"
        message={
          <>
            ต้องการลบ “<b>{pendingDelete?.name}</b>” อย่างถาวรหรือไม่
            <br />
            <span className="text-body text-ink-500">
              เอกสารที่เคยใช้รายการนี้จะไม่เปลี่ยนแปลง — หากแค่ไม่ต้องการเสนออีก ให้ใช้ “ปิดการใช้งาน” แทน
            </span>
          </>
        }
        confirmLabel="ลบรายการ"
        onConfirm={() => {
          if (pendingDelete) del.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ItemFormDialog open={dialogOpen} item={editItem} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
