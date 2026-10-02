import { useCallback, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Package, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useDeleteItem, useItems, useSaveItem, useSetItemActive, type ItemSort } from '../hooks/useItems'
import { useDebounced } from '../hooks/useDebounced'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { useToast } from '../components/ui/toast'
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

const thCls =
  'sticky top-0 z-10 border-b border-card-border bg-ink-50 px-3 py-2.5 text-left text-label font-medium text-ink-500'

const SORTS: { v: ItemSort; th: string }[] = [
  { v: 'recent', th: 'เพิ่มล่าสุด' },
  { v: 'name', th: 'ชื่อ ก-ฮ' },
  { v: 'price-desc', th: 'ราคาสูงสุด' },
  { v: 'price-asc', th: 'ราคาต่ำสุด' },
]

const empty = { id: '' as string | undefined, name: '', unit: 'รายการ', unitPrice: '' }

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

  const startEdit = (it: { id: string; name: string; unit: string; unitPrice: number }) => {
    setForm({ id: it.id, name: it.name, unit: it.unit, unitPrice: String(it.unitPrice) })
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
        sub="รายการสินค้าและบริการ สำหรับเรียกใช้เมื่อสร้างธุรกรรม (ชื่อ · หน่วย · ราคา)"
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
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="item-search" className="sr-only">
                ค้นหารายการสินค้า/บริการ
              </label>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input
                id="item-search"
                ref={searchRef}
                className={cn('pl-10', search && 'pr-10')}
                placeholder="ค้นหาชื่อรายการ / หน่วย…"
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
                onChange={(e) => setSort(e.target.value as ItemSort)}
                aria-label="เรียงลำดับรายการสินค้า"
                className="h-9 w-auto min-w-40"
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
              {isLoading ? 'กำลังโหลด…' : `${items.length.toLocaleString('th-TH')} รายการ`}
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-ink-900"
              />
              แสดงรายการที่ปิดใช้งาน
            </label>
            {filtered && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
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
            title="โหลดรายการสินค้า/บริการไม่สำเร็จ"
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
                  aria-label="กำลังโหลดรายการสินค้า"
                >
                  <div className="h-full w-1/3 animate-pulse bg-primary" />
                </div>
              )}
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full min-w-[620px] border-collapse text-body">
                  <thead>
                    <tr>
                      <th scope="col" className={thCls}>
                        รายการ
                      </th>
                      <th scope="col" className={thCls}>
                        หน่วย
                      </th>
                      <th scope="col" className={cn(thCls, 'text-right')}>
                        ราคา
                      </th>
                      <th scope="col" className={cn(thCls, 'w-28 text-right')}>
                        <span className="sr-only">จัดการ</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton rows={6} cols={4} />
                    ) : (
                      items.map((it) => {
                        const archived = it.isActive === false
                        return (
                          <tr
                            key={it.id}
                            className={cn(
                              'border-b border-card-border transition last:border-0 hover:bg-ink-50',
                              archived && 'opacity-60',
                            )}
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold">{it.name}</span>
                                {archived && (
                                  <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-micro font-medium text-ink-500">
                                    ปิดใช้งาน
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-ink-500">{it.unit || '—'}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtTHB(it.unitPrice)}</td>
                            <td className="px-2 py-2.5">
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
