import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../hooks/useSettings'
import { useClientAuth } from '../lib/client-auth'
import type { TenantSettings } from '../lib/settings'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label, inputCls } from '../components/ui/input'

function Section({ step, title, desc, children }: { step: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-[13px] font-bold text-white">{step}</span>
          <div className="min-w-0">
            <h2 className="font-bold leading-tight">{title}</h2>
            {desc && <p className="mt-0.5 text-[13px] text-ink-500">{desc}</p>}
          </div>
        </div>
        {children}
      </CardBody>
    </Card>
  )
}

export function Settings() {
  const { isClientAdmin, ready } = useClientAuth()
  const { data } = useSettings()
  const save = useUpdateSettings()
  const [form, setForm] = useState<TenantSettings | null>(null)
  const [newType, setNewType] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form) return <p className="py-10 text-center text-sm text-ink-500">กำลังโหลด…</p>
  const readOnly = !isClientAdmin
  const set = (patch: Partial<TenantSettings>) => setForm({ ...form, ...patch })

  const addType = () => {
    const v = newType.trim()
    if (!v || form.paymentTypes.includes(v)) return
    set({ paymentTypes: [...form.paymentTypes, v] })
    setNewType('')
  }

  const submit = async () => {
    setMsg('')
    try {
      await save.mutateAsync(form)
      setMsg('บันทึกแล้ว ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="ตั้งค่า"
        sub={readOnly ? 'ดูได้อย่างเดียว — เฉพาะผู้ดูแลลูกค้า (client_admin) แก้ไขได้' : 'ปรับแต่งข้อมูลบริษัท ภาษี และเอกสารของลูกค้ารายนี้'}
      />

      <Section step="1" title="ข้อมูลบริษัท" desc="แสดงบนใบเสร็จ · รหัสลูกค้าใช้เป็น prefix เลขใบเสร็จ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint="A–Z 0–9 · 2–12">รหัสลูกค้า (prefix)</Label>
            <Input
              value={form.clientCode}
              onChange={(e) => set({ clientCode: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) })}
              disabled={readOnly}
              placeholder="ABC"
              className="font-mono"
            />
          </div>
          <div>
            <Label>ปี พ.ศ. (ใช้ในเลขใบเสร็จ)</Label>
            <Input
              value={String(form.beYear)}
              onChange={(e) => set({ beYear: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              disabled={readOnly}
              inputMode="numeric"
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>ชื่อบริษัท (ผู้ซื้อ)</Label>
            <Input value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} disabled={readOnly} />
          </div>
          <div className="sm:col-span-2">
            <Label>ที่อยู่</Label>
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} disabled={readOnly} />
          </div>
          <div>
            <Label hint="13 หลัก">เลขประจำตัวผู้เสียภาษี</Label>
            <Input
              value={form.taxId}
              onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, '').slice(0, 13) })}
              disabled={readOnly}
              className="font-mono"
            />
          </div>
          <div>
            <Label>ผู้ติดต่อ</Label>
            <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} disabled={readOnly} />
          </div>
        </div>
      </Section>

      <Section step="2" title="การเงิน / ภาษี" desc="ประเภทการจ่ายและอัตราภาษีหัก ณ ที่จ่าย (WHT)">
        <div>
          <Label>ประเภทการจ่าย</Label>
          <div className="flex flex-wrap gap-1.5">
            {form.paymentTypes.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-ink-700">
                {p}
                {!readOnly && (
                  <button type="button" onClick={() => set({ paymentTypes: form.paymentTypes.filter((x) => x !== p) })} className="text-ink-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!readOnly && (
            <div className="mt-2 flex gap-2">
              <Input value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addType()} placeholder="เพิ่มประเภท เช่น ค่าที่ปรึกษา" className="max-w-xs" />
              <Button variant="secondary" onClick={addType}><Plus size={15} /> เพิ่ม</Button>
            </div>
          )}
        </div>

        <div>
          <Label hint="%">อัตรา WHT ตามประเภท</Label>
          <div className="space-y-2">
            {form.whtRates.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.paymentType}
                  onChange={(e) => set({ whtRates: form.whtRates.map((x, idx) => (idx === i ? { ...x, paymentType: e.target.value } : x)) })}
                  disabled={readOnly}
                  className="flex-1"
                />
                <Input
                  value={String(r.value)}
                  onChange={(e) => set({ whtRates: form.whtRates.map((x, idx) => (idx === i ? { ...x, value: Number(e.target.value) || 0 } : x)) })}
                  disabled={readOnly}
                  inputMode="decimal"
                  className="w-24 text-right tabular-nums"
                />
                {!readOnly && (
                  <button type="button" onClick={() => set({ whtRates: form.whtRates.filter((_, idx) => idx !== i) })} className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <Button variant="secondary" className="mt-2" onClick={() => set({ whtRates: [...form.whtRates, { paymentType: '', value: 0, label: '' }] })}>
              <Plus size={15} /> เพิ่มอัตรา
            </Button>
          )}
        </div>

        <div>
          <Label hint="บาท">เกณฑ์เตือนอากรแสตมป์</Label>
          <Input
            value={String(form.stampDutyWarningThreshold)}
            onChange={(e) => set({ stampDutyWarningThreshold: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
            disabled={readOnly}
            inputMode="decimal"
            className="max-w-xs text-right tabular-nums"
          />
        </div>
      </Section>

      <Section step="3" title="เอกสาร" desc="ลิงก์ผู้ขาย · ข้อความยินยอม · บันทึกท้ายใบเสร็จ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint="วัน">อายุลิงก์ผู้ขาย</Label>
            <Input
              value={String(form.linkExpiryDays)}
              onChange={(e) => set({ linkExpiryDays: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              disabled={readOnly}
              inputMode="numeric"
              className="text-right tabular-nums"
            />
          </div>
          <label className="flex items-center gap-3 self-end pb-2.5 text-sm">
            <input type="checkbox" checked={form.showVerifyQr} onChange={(e) => set({ showVerifyQr: e.target.checked })} disabled={readOnly} className="h-4 w-4" />
            แสดง QR ตรวจสอบบนสำเนาภายใน
          </label>
        </div>
        <div>
          <Label>บันทึกท้ายใบเสร็จ</Label>
          <Input value={form.receiptNote} onChange={(e) => set({ receiptNote: e.target.value })} disabled={readOnly} placeholder="เช่น ขอบคุณที่ใช้บริการ" />
        </div>
        <div>
          <Label>ข้อความยินยอม (consent v1)</Label>
          <textarea
            value={form.consentTextV1}
            onChange={(e) => set({ consentTextV1: e.target.value })}
            disabled={readOnly}
            rows={3}
            className={`${inputCls} h-auto py-2.5 leading-relaxed`}
          />
        </div>
      </Section>

      {msg && <p className={`text-sm font-medium ${msg.includes('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{msg}</p>}
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={save.isPending || !ready}>
            <Save size={16} /> {save.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
          </Button>
        </div>
      )}
    </div>
  )
}
