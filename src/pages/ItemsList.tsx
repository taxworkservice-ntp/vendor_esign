import { useState } from 'react'
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useDeleteItem, useItems, useSaveItem } from '../hooks/useItems'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { FieldError, Input, Label } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { fmtTHB } from '../lib/format'

const thCls = 'px-3 py-2 text-left text-label font-semibold uppercase tracking-wide text-ink-500'

const empty = { id: '' as string | undefined, name: '', unit: 'รายการ', unitPrice: '' }

export function ItemsList() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useItems(q)
  const save = useSaveItem()
  const del = useDeleteItem()
  const [form, setForm] = useState(empty)
  const [err, setErr] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const editing = !!form.id

  const submit = async () => {
    setErr('')
    try {
      await save.mutateAsync({
        id: form.id,
        name: form.name,
        unit: form.unit,
        unitPrice: Number(form.unitPrice) || 0,
      })
      setForm(empty)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="สินค้า / บริการ" sub="รายการสินค้าและบริการ สำหรับเรียกใช้เมื่อสร้างธุรกรรม (ชื่อ · จำนวน · ราคา)" />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-ink-900 text-white">
              {editing ? <Pencil size={14} /> : <Plus size={16} />}
            </span>
            <h2 className="font-semibold">{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_160px_auto]">
            <div>
              <Label>ชื่อรายการ</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ค่าจ้างทำความสะอาด" />
            </div>
            <div>
              <Label>หน่วย</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="รายการ" />
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
                <Button variant="ghost" onClick={() => setForm(empty)}>
                  <X size={15} /> ยกเลิก
                </Button>
              )}
            </div>
          </div>
          <FieldError msg={err} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input className="pl-10" placeholder="ค้นหารายการ…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-body">
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th className={thCls}>รายการ</th>
                <th className={thCls}>หน่วย</th>
                <th className={`${thCls} text-right`}>ราคา</th>
                <th className={`${thCls} w-24 text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableSkeleton rows={5} cols={4} />}
              {!isLoading && data?.map((it) => (
                <tr key={it.id} className="border-b border-card-border last:border-0 hover:bg-ink-50">
                  <td className="px-3 py-2.5 font-semibold">{it.name}</td>
                  <td className="px-3 py-2.5 text-ink-500">{it.unit || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtTHB(it.unitPrice)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setForm({ id: it.id, name: it.name, unit: it.unit, unitPrice: String(it.unitPrice) })}
                        className="grid h-8 w-8 place-items-center rounded-control text-ink-500 hover:bg-ink-100"
                        title="แก้ไข"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ id: it.id, name: it.name })}
                        className="grid h-8 w-8 place-items-center rounded-control text-ink-400 hover:bg-ink-100 hover:text-red-600"
                        title="ลบ"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 && !isLoading && (
          <EmptyState
            icon={Package}
            title="ยังไม่มีรายการสินค้า/บริการ"
            description="เพิ่มรายการด้านบนเพื่อเรียกใช้เมื่อสร้างธุรกรรม"
          />
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบรายการ"
        message={<>ต้องการลบ “<b>{pendingDelete?.name}</b>” ออกจากรายการสินค้า/บริการหรือไม่</>}
        confirmLabel="ลบรายการ"
        onConfirm={() => { if (pendingDelete) del.mutate(pendingDelete.id); setPendingDelete(null) }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
