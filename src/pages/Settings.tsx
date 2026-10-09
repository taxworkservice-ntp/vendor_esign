import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Save, X } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../hooks/useSettings'
import { useClientAuth } from '../lib/client-auth'
import { currentBeYear, type TenantSettings } from '../lib/settings'
import { signDownload, signUpload, uploadToR2 } from '../lib/r2-assets'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label, Textarea } from '../components/ui/input'
import { useToast } from '../components/ui/toast'

function Section({ step, title, desc, children }: { step: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-primary text-body font-semibold text-white">{step}</span>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">{title}</h2>
            {desc && <p className="mt-0.5 text-body text-ink-500">{desc}</p>}
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
  const toast = useToast()
  const [form, setForm] = useState<TenantSettings | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    // Year is derived from today (never user-set) — keep the stored value current.
    if (data) setForm({ ...data, beYear: currentBeYear() })
  }, [data])

  if (!form) return <p className="py-10 text-center text-body text-ink-500">กำลังโหลด…</p>
  const readOnly = !isClientAdmin
  const set = (patch: Partial<TenantSettings>) => setForm({ ...form, ...patch })

  const submit = async () => {
    setMsg('')
    try {
      await save.mutateAsync(form)
      setMsg('บันทึกแล้ว')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="ตั้งค่า"
        sub={readOnly ? 'ดูได้อย่างเดียว — เฉพาะผู้ดูแลระบบ (admin) แก้ไขได้' : 'ปรับแต่งข้อมูลบริษัท ภาษี และเอกสารสำหรับออกใบเสร็จรับเงินผู้ขาย'}
      />

      <Section step="1" title="ข้อมูลบริษัท" desc="แสดงบนใบเสร็จ · รหัสลูกค้าใช้เป็นคำนำหน้าเลขที่ใบเสร็จ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint="ล็อกโดยระบบ">รหัสลูกค้า (Client ID)</Label>
            <Input
              value={form.clientCode}
              disabled
              placeholder="ABC"
              className="font-mono"
            />
          </div>
          <div>
            <Label hint="ใช้ในเลขที่ใบเสร็จ">ปี พ.ศ.</Label>
            <p className="py-2.5 font-mono">
              {form.beYear}
              <span className="ml-2 font-sans text-body text-ink-500">(ค.ศ. {form.beYear - 543}) · ใช้ปีปัจจุบันอัตโนมัติ</span>
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label hint="ล็อกโดยระบบ">ชื่อบริษัท (ผู้ซื้อ)</Label>
            <Input value={form.displayName} disabled />
          </div>
          <div className="sm:col-span-2">
            <Label>ที่อยู่</Label>
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} disabled={readOnly} />
          </div>
          <div>
            <Label hint="ล็อกโดยระบบ">เลขประจำตัวผู้เสียภาษี</Label>
            <Input value={form.taxId} disabled className="font-mono" />
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
            {form.whtRates.map((r) => (
              <span key={r.paymentType} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-3 py-1.5 text-body font-semibold text-ink-700">
                {r.paymentType}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-label text-ink-500">ประเภทการจ่ายตามมาตรฐานกรมสรรพากร (แก้ไขอัตราได้ เพิ่ม/ลบ/เปลี่ยนชื่อไม่ได้)</p>
        </div>

        <div>
          <Label hint="%">อัตรา WHT ตามประเภท</Label>
          <div className="space-y-2">
            {form.whtRates.map((r, i) => (
              <div key={r.paymentType} className="flex items-center gap-2">
                <p className="flex-1 py-2.5 font-semibold">{r.paymentType}</p>
                <Input
                  value={String(r.value)}
                  onChange={(e) => set({ whtRates: form.whtRates.map((x, idx) => (idx === i ? { ...x, value: Number(e.target.value) || 0 } : x)) })}
                  disabled={readOnly}
                  inputMode="decimal"
                  className="w-24 text-right tabular-nums"
                />
                <span className="text-label text-ink-500">%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label hint="บาท · 0 = ปิด">ยอดขั้นต่ำที่ต้องหักภาษี ณ ที่จ่าย</Label>
          <Input
            value={String(form.whtMinThreshold)}
            onChange={(e) => set({ whtMinThreshold: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
            disabled={readOnly}
            inputMode="decimal"
            className="max-w-xs text-right tabular-nums"
          />
          <p className="mt-1.5 text-label text-ink-500">
            ตามมาตรา 50/1 — หากฐานภาษีต่ำกว่านี้ ระบบจะไม่หักภาษี ณ ที่จ่าย (ยกเว้นสัญญาต่อเนื่องที่ผู้จ่ายเลือกหักได้)
          </p>
        </div>
      </Section>

      <Section step="3" title="เอกสาร" desc="ลิงก์ผู้ขาย · ข้อความเชิญผู้ขาย · บันทึกท้ายใบเสร็จ · ข้อความให้ความยินยอม">
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
          <label className="flex items-center gap-3 self-end pb-2.5 text-body">
            <input type="checkbox" checked={form.showVerifyQr} onChange={(e) => set({ showVerifyQr: e.target.checked })} disabled={readOnly} className="h-4 w-4" />
            แสดง QR ตรวจสอบบนสำเนาภายใน
          </label>
        </div>
        <div>
          <Label>บันทึกท้ายใบเสร็จ</Label>
          <Input value={form.receiptNote} onChange={(e) => set({ receiptNote: e.target.value })} disabled={readOnly} placeholder="เช่น ขอบคุณที่ใช้บริการ" />
        </div>
        <div>
          <Label hint={'ตัวแปร: {{vendor}} {{vendorPrefix}} {{date}} {{amount}} {{link}}'}>ข้อความเชิญผู้ขาย (เทมเพลต)</Label>
          <Textarea
            value={form.inviteMessageTemplate}
            onChange={(e) => set({ inviteMessageTemplate: e.target.value })}
            disabled={readOnly}
            rows={6}
          />
          <p className="mt-1.5 text-label text-ink-500">ข้อความนี้จะถูกเติมค่าจริงก่อนคัดลอกส่งให้ผู้ขาย และแก้ไขรายครั้งได้ที่หน้ารายการ</p>
        </div>
        <div>
          <Label hint={'ตัวแปร: {{client}} {{link}}'}>ข้อความเชิญผู้ขายกรอกข้อมูล (เทมเพลต)</Label>
          <Textarea
            value={form.vendorInviteMessageTemplate}
            onChange={(e) => set({ vendorInviteMessageTemplate: e.target.value })}
            disabled={readOnly}
            rows={5}
          />
          <p className="mt-1.5 text-label text-ink-500">ใช้กับลิงก์เชิญผู้ขายกรอกข้อมูลเอง (หน้าผู้ขาย) — เติมชื่อลูกค้าและลิงก์ให้อัตโนมัติ</p>
        </div>
        <div>
          <Label>ข้อความให้ความยินยอม (ฉบับที่ 1)</Label>
          <Textarea
            value={form.consentTextV1}
            onChange={(e) => set({ consentTextV1: e.target.value })}
            disabled={readOnly}
            rows={3}
          />
        </div>
      </Section>

      <Section step="4" title="ลายเซ็นและตราประทับ" desc="ใส่ลายเซ็นและตราประทับบนหนังสือรับรองภาษีหัก ณ ที่จ่าย (WHT)">
        <div className="grid gap-4 sm:grid-cols-2">
          <AssetUpload
            label="ลายเซ็นผู้มีอำนาจ"
            hint="PNG/JPG — แนะนำพื้นหลังโปร่งใส แนวนอน"
            storagePath={form.signatureStoragePath}
            onUploaded={(path) => set({ signatureStoragePath: path })}
            onError={(e) => toast.show(e, 'error')}
            disabled={readOnly}
          />
          <AssetUpload
            label="ตราประทับ"
            hint="PNG — แนะนำพื้นหลังโปร่งใส ขนาด 1:1"
            storagePath={form.stampStoragePath}
            onUploaded={(path) => set({ stampStoragePath: path })}
            onError={(e) => toast.show(e, 'error')}
            disabled={readOnly}
          />
        </div>
      </Section>

      {msg && <p className={`text-body font-medium ${msg === 'บันทึกแล้ว' ? 'text-success' : 'text-danger'}`}>{msg}</p>}
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={submit} loading={save.isPending} disabled={!ready}>
            <Save size={16} /> {save.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
          </Button>
        </div>
      )}
    </div>
  )
}

function AssetUpload({
  label,
  hint,
  storagePath,
  onUploaded,
  onError,
  disabled,
}: {
  label: string
  hint?: string
  storagePath?: string
  onUploaded: (path: string) => void
  onError: (msg: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!storagePath) {
      setPreview(null)
      return
    }
    let cancelled = false
    void signDownload(storagePath).then((url) => {
      if (!cancelled) setPreview(url)
    }).catch(() => {
      if (!cancelled) setPreview(null)
    })
    return () => { cancelled = true }
  }, [storagePath])

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5_000_000) {
      onError('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)')
      return
    }
    setUploading(true)
    const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    void signUpload(fileName)
      .then((sig) => uploadToR2(sig.url, file).then(() => sig))
      .then((sig) => onUploaded(sig.path))
      .catch((e) => onError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ'))
      .finally(() => setUploading(false))
  }

  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {storagePath
        ? (
          <div className="mt-1 flex items-start gap-3">
            <div className="relative flex h-20 items-center justify-center rounded-control border border-card-border bg-white px-3">
              {preview
                ? <img src={preview} alt={label} className="max-h-16 max-w-24 object-contain" />
                : <Loader2 size={18} className="animate-spin text-ink-400" />}
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => onUploaded(undefined as never)}
                aria-label={`ลบ${label}`}
                className="grid h-8 w-8 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-danger"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        )
        : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="mt-1 flex h-20 w-full items-center justify-center gap-2 rounded-control border border-dashed border-card-border text-label text-ink-500 transition hover:border-ink-400 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
            {uploading ? 'กำลังอัปโหลด…' : 'เลือกไฟล์ภาพ'}
          </button>
        )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
