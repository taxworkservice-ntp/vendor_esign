import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { useSaveItem } from '../../hooks/useItems'
import { useSettings } from '../../hooks/useSettings'
import { defaultSettings } from '../../lib/settings'
import { itemCode } from '../../lib/ids'
import type { CatalogItem } from '../../lib/items-mock'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'
import { FieldError, Input, Label } from '../ui/input'
import { Select } from '../ui/select'
import { RegistryId } from '../ui/data-table'
import { useToast } from '../ui/toast'

// Catalog item, created/edited in a focused modal. The form outgrew an inline
// card once it carried a tax type plus a variable-length sub-note list, so it
// now lives here — the list page stays a list. The item's WHT type is the
// workspace's tax source of truth: transactions derive their rate from it, so
// this is an owner-facing task (gated at the call site).

interface FormState {
  id?: string
  itemNo: number
  name: string
  unit: string
  unitPrice: string
  paymentType: string
  subItems: string[]
}

const emptyForm: FormState = {
  id: undefined, itemNo: 0, name: '', unit: 'รายการ', unitPrice: '', paymentType: '', subItems: [],
}

function fromItem(it: CatalogItem): FormState {
  return {
    id: it.id,
    itemNo: it.itemNo ?? 0,
    name: it.name,
    unit: it.unit,
    unitPrice: String(it.unitPrice),
    paymentType: it.paymentType ?? '',
    subItems: [...(it.subItems ?? [])],
  }
}

export function ItemFormDialog({
  open,
  item,
  onClose,
}: {
  open: boolean
  /** null = create; an item = edit. */
  item: CatalogItem | null
  onClose: () => void
}) {
  const save = useSaveItem()
  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [subDraft, setSubDraft] = useState('')
  const [err, setErr] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Fresh state each time the dialog opens; focus the first field.
  useEffect(() => {
    if (!open) return
    setForm(item ? fromItem(item) : emptyForm)
    setSubDraft('')
    setErr('')
    const t = setTimeout(() => nameRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, item])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !save.isPending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, save.isPending, onClose])

  if (!open) return null

  const editing = !!form.id

  const addSubNote = () => {
    const s = subDraft.trim()
    if (!s || form.subItems.some((x) => x === s) || form.subItems.length >= 10) return
    setForm({ ...form, subItems: [...form.subItems, s] })
    setSubDraft('')
  }

  const submit = async () => {
    setErr('')
    if (form.name.trim().length < 2) {
      setErr('กรุณากรอกชื่อรายการ')
      return
    }
    if (!form.paymentType) {
      setErr('กรุณาเลือกประเภทภาษีของรายการ')
      return
    }
    try {
      await save.mutateAsync({
        id: form.id,
        name: form.name,
        unit: form.unit,
        unitPrice: Number(form.unitPrice) || 0,
        paymentType: form.paymentType,
        subItems: form.subItems,
      })
      toast.show(editing ? `บันทึก “${form.name.trim()}” แล้ว` : `เพิ่ม “${form.name.trim()}” แล้ว`)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-lg">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-control bg-primary text-white">
                {editing ? <Pencil size={14} aria-hidden /> : <Plus size={16} aria-hidden />}
              </span>
              <h2 id="item-form-title" className="text-title font-semibold">{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
              {editing && form.itemNo > 0 && <RegistryId code={itemCode(form.itemNo)} />}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              aria-label="ปิดแบบฟอร์ม"
              className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 disabled:opacity-40"
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label required hint="ห้ามซ้ำ">ชื่อรายการ</Label>
              <Input
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder="เช่น ค่าจ้างทำความสะอาด"
              />
            </div>
            <div>
              <Label>หน่วย</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="รายการ" />
            </div>
            <div>
              <Label>ราคา/หน่วย (บาท)</Label>
              <Input
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                className="text-right tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <Label required hint="กำหนดภาษีของธุรกรรมที่ใช้รายการนี้">ประเภทภาษี (WHT)</Label>
              <Select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })}>
                <option value="">— เลือกประเภท —</option>
                {cfg.whtRates.map((r) => (
                  <option key={r.paymentType} value={r.paymentType}>
                    {r.paymentType}{r.value > 0 ? ` (${r.value}%)` : ' (ไม่หักภาษี)'}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label hint="ไม่คิดราคา · แสดงใต้บรรทัดบนใบเสร็จ">รายการย่อย (หมายเหตุ)</Label>
            {form.subItems.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {form.subItems.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-body">
                    <span className="min-w-0 flex-1 truncate">• {s}</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, subItems: form.subItems.filter((x) => x !== s) })}
                      aria-label={`ลบหมายเหตุ ${s}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-danger"
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubNote()
                }}
                placeholder="เช่น ด้านหน้า"
                maxLength={120}
              />
              <Button variant="secondary" onClick={addSubNote} disabled={!subDraft.trim()}>
                เพิ่ม
              </Button>
            </div>
          </div>

          <FieldError msg={err} />

          <div className="flex justify-end gap-2 border-t border-card-border pt-4">
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => void submit()} loading={save.isPending} disabled={!form.name.trim()}>
              {save.isPending ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'เพิ่มรายการ'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
