import { useCallback, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useDeleteItem, useItems, useSaveItem, useSetItemActive, type ItemSort } from '../hooks/useItems'
import { useDebounced } from '../hooks/useDebounced'
import { itemCode } from '../lib/ids'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { FieldError, Input, Label } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { useToast } from '../components/ui/toast'
import { RegistryToolbar, type SortOption } from '../components/ui/registry-toolbar'
import { LoadingBar, RegistryId, Row, Td, Th, tableCls } from '../components/ui/data-table'
import { fmtTHB } from '../lib/format'
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

const SORTS: SortOption<ItemSort>[] = [
  { v: 'recent', th: 'เพิ่มล่าสุด' },
  { v: 'name', th: 'ชื่อ ก-ฮ' },
  { v: 'price-desc', th: 'ราคาสูงสุด' },
  { v: 'price-asc', th: 'ราคาต่ำสุด' },
]

const empty = { id: '' as string | undefined, itemNo: 0, name: '', unit: 'รายการ', unitPrice: '' }

export function ItemsList() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ItemSort>('recent')
  const [showArchived, setShowArchived] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const debouncedSearch = useDebounced(search, 250)
  const { data, isLoading, isFetching, isError, error, refetch } = useItems(debouncedSearch, sort, showArchived)
  const save = useSaveItem()
  const del = useDeleteItem()
  const setActive = useSetItemActive()
  const [form, setForm] = useState(empty)
  const [err, setErr] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null)
  const toast = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => data ?? [], [data])
  const editing = !!form.id

  const closeForm = useCallback(() => {
    setForm(empty)
    setErr('')
    setShowForm(false)
  }, [])

  const submit = async () => {
    setErr('')
    try {
      await save.mutateAsync({
        id: form.id,
        name: form.name,
        unit: form.unit,
        unitPrice: Number(form.unitPrice) || 0,
      })
      toast.show(editing ? `บันทึก “${form.name.trim()}” แล้ว` : `เพิ่ม “${form.name.trim()}” แล้ว`)
      closeForm()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  const startEdit = (it: { id: string; itemNo: number; name: string; unit: string; unitPrice: number }) => {
    setForm({ id: it.id, itemNo: it.itemNo, name: it.name, unit: it.unit, unitPrice: String(it.unitPrice) })
    setErr('')
    setShowForm(true)
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
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus size={17} /> เพิ่มรายการใหม่
            </Button>
          )
        }
      />

      {showForm && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-primary text-white">
                  {editing ? <Pencil size={14} aria-hidden /> : <Plus size={16} aria-hidden />}
                </span>
                <h2 className="font-semibold">{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
                {editing && form.itemNo > 0 && <RegistryId code={itemCode(form.itemNo)} />}
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="ปิดแบบฟอร์ม"
                className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_160px_auto]">
              <div>
                <Label required hint="ห้ามซ้ำ">ชื่อรายการ</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                  placeholder="เช่น ค่าจ้างทำความสะอาด"
                  autoFocus
                />
              </div>
              <div>
                <Label>หน่วย</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="รายการ"
                />
              </div>
              <div>
                <Label>ราคา (บาท)</Label>
                <Input
                  value={form.unitPrice}
                  onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={submit} loading={save.isPending} disabled={!form.name.trim()}>
                  {save.isPending ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'เพิ่ม'}
                </Button>
                {editing && (
                  <Button variant="ghost" onClick={closeForm}>
                    ยกเลิก
                  </Button>
                )}
              </div>
            </div>
            <FieldError msg={err} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <RegistryToolbar
            searchId="item-search"
            search={search}
            onSearch={setSearch}
            placeholder="ค้นหาชื่อรายการ / หน่วย / รหัส (ITM-001)…"
            inputRef={searchRef}
            sort={sort}
            onSort={setSort}
            sorts={SORTS}
            sortAriaLabel="เรียงลำดับรายการสินค้า"
            sortWidth="min-w-40"
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
                <table className={cn(tableCls, 'min-w-[680px]')}>
                  <thead>
                    <tr>
                      <Th className="w-28">รหัส</Th>
                      <Th>รายการ</Th>
                      <Th>หน่วย</Th>
                      <Th align="right">ราคา</Th>
                      <Th align="right" className="w-32">
                        <span className="sr-only">จัดการ</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={6} cols={5} />
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
                            <Td className="px-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleActive(it)}
                                  title={archived ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน (ซ่อนจากรายการ แต่เอกสารเดิมยังอยู่)'}
                                  aria-label={archived ? `เปิดการใช้งาน ${it.name}` : `ปิดการใช้งาน ${it.name}`}
                                  className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                >
                                  {archived ? <ArchiveRestore size={15} aria-hidden /> : <Archive size={15} aria-hidden />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEdit(it)}
                                  className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                                  title="แก้ไข"
                                  aria-label={`แก้ไข ${it.name}`}
                                >
                                  <Pencil size={15} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete({ id: it.id, name: it.name })}
                                  className="grid h-8 w-8 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-danger"
                                  title="ลบถาวร"
                                  aria-label={`ลบ ${it.name}`}
                                >
                                  <Trash2 size={15} aria-hidden />
                                </button>
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
                    <Button onClick={() => setShowForm(true)}>
                      <Plus size={17} /> เพิ่มรายการใหม่
                    </Button>
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
    </div>
  )
}
