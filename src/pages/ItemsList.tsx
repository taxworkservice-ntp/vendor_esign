import { useState } from 'react'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useDeleteItem, useItems, useSaveItem } from '../hooks/useItems'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Input, Label } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { FieldError } from '../components/ui/input'
import { fmtTHB } from '../lib/format'

const thCls = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500'

const empty = { id: '' as string | undefined, name: '', unit: 'รายการ', unitPrice: '' }

export function ItemsList() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useItems(q)
  const save = useSaveItem()
  const del = useDeleteItem()
  const [form, setForm] = useState(empty)
  const [err, setErr] = useState('')

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
      <PageHeader title="สินค้า / บริการ" sub="แคตตาล็อกรายการ สำหรับดึงไปใช้ตอนสร้างธุรกรรม (ชื่อ · จำนวน · ราคา)" />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900 text-white">
              {editing ? <Pencil size={14} /> : <Plus size={16} />}
            </span>
            <h2 className="font-bold">{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
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
              <Label>ราคา (฿)</Label>
              <Input
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                className="text-right tabular-nums"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={submit} disabled={save.isPending || !form.name.trim()}>
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
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className={thCls}>รายการ</th>
                <th className={thCls}>หน่วย</th>
                <th className={`${thCls} text-right`}>ราคา</th>
                <th className={`${thCls} w-24 text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((it) => (
                <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-semibold">{it.name}</td>
                  <td className="px-3 py-2.5 text-ink-500">{it.unit || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">฿{fmtTHB(it.unitPrice)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setForm({ id: it.id, name: it.name, unit: it.unit, unitPrice: String(it.unitPrice) })}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-slate-100"
                        title="แก้ไข"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => del.mutate(it.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-red-600"
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
        {isLoading && <p className="px-4 py-6 text-sm text-ink-500">กำลังโหลด…</p>}
        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">ยังไม่มีรายการในแคตตาล็อก</p>
            <p className="mt-1 text-sm text-ink-500">เพิ่มรายการด้านบนเพื่อดึงไปใช้ตอนสร้างธุรกรรม</p>
          </div>
        )}
      </Card>
    </div>
  )
}
