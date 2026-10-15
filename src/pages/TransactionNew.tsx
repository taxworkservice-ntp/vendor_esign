import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Info, Lock, Plus, ShieldAlert, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import { calcWht, isDuplicateSlipRef } from '../lib/config'
import { applyWhtThreshold, belowWhtThreshold } from '../lib/wht-calc'
import { defaultSettings, whtRateFor } from '../lib/settings'
import { resolveTransactionTax } from '../lib/item-tax'
import { itemsTotal, lineTotal, normalizeLineItem } from '../lib/line-items'
import { vendorTaxIdMatches } from '../lib/vendor-match'
import { vendorDisplayName } from '../lib/vendor-name'
import { useAllSlipRefs, useCreateTransaction } from '../hooks/useTransactions'
import { useAllVendors, useRecalledVendorId, useVendorMemory } from '../hooks/useVendors'
import { useAllItems } from '../hooks/useItems'
import { useSettings } from '../hooks/useSettings'
import { useClientAuth } from '../lib/client-auth'
import type { CatalogItem } from '../lib/items-mock'
import { VendorPicker } from '../components/vendor-picker'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { HelpLink } from '../components/ui/help-link'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { todayISO } from '../lib/txn-filters'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { ErrorState } from '../components/ui/error-state'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { cn } from '../lib/cn'
import type { LineItem } from '../lib/types'

// A picked catalog line. Description, unit and tax come from the item and are
// never typed here; only quantity + unit price are facts the officer supplies.
// Discount stays editable (a commercial fact, not a tax decision).
interface Row {
  key: string
  itemId: string
  name: string
  unit: string
  quantity: string
  unitPrice: string
  discount: string
  paymentType: string
  subItems: string[]
  ticked: boolean[]
}

let rowSeq = 0
const toPickedRow = (c: CatalogItem, overrides?: Partial<Pick<Row, 'quantity' | 'unitPrice' | 'discount'>>): Row => ({
  key: `${c.id}-${Date.now().toString(36)}-${rowSeq++}`,
  itemId: c.id,
  name: c.name,
  unit: c.unit || 'รายการ',
  quantity: overrides?.quantity ?? '1',
  unitPrice: overrides?.unitPrice ?? String(c.unitPrice ?? 0),
  discount: overrides?.discount ?? '',
  paymentType: c.paymentType ?? '',
  subItems: [...(c.subItems ?? [])],
  ticked: (c.subItems ?? []).map(() => true),
})

function Section({
  step,
  title,
  desc,
  children,
}: {
  step: string
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-primary text-body font-semibold text-white">
            {step}
          </span>
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

export function TransactionNew() {
  const nav = useNavigate()
  // Display-only mirror of the server gate: without the flag the form would
  // only fail on submit, so it is not shown at all.
  const { can } = useClientAuth()
  const create = useCreateTransaction()
  const existingRefs = useAllSlipRefs()
  const vendors = useAllVendors()
  const catalogItems = useAllItems()
  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()

  // No vendor preselected — the user must choose one explicitly.
  const [vendorId, setVendorId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [note, setNote] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ] = useState('')
  const [transferDate, setTransferDate] = useState(() => todayISO())
  const [slipRef, setSlipRef] = useState('')
  const [slipName, setSlipName] = useState('')
  const [vendorTaxId, setVendorTaxId] = useState('')
  const [touched, setTouched] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Vendor memory: auto-fill if the user hasn't typed yet, else offer suggestions.
  const memory = useVendorMemory(vendorId)
  const userTouched = useRef(false)
  const appliedRef = useRef<string | null>(null)
  const [appliedVendor, setAppliedVendor] = useState<string | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)

  const catalog = memory.data?.items ?? []

  // Prefill the tax ID from the selected vendor's registered ID (else the
  // encrypted recall in live mode). Editable afterwards; verified below.
  const recalledId = useRecalledVendorId(vendorId)
  const idFilledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!vendorId || idFilledRef.current === vendorId) return
    const known = vendors.find((v) => v.id === vendorId)?.taxId || recalledId.data
    if (!known) return
    setVendorTaxId(known)
    idFilledRef.current = vendorId
  }, [vendorId, vendors, recalledId.data])

  // Vendor memory: prefill from the vendor's last transaction, mapped onto
  // catalog items by name. Lines matching no item are skipped — every line
  // must come from the catalog so tax always resolves. Waits for the catalog
  // to load first, or an early memory hit would lock in an empty form.
  useEffect(() => {
    const last = memory.data?.last
    if (!last || appliedRef.current === vendorId) return
    if (userTouched.current) {
      setShowSuggest(true)
      return
    }
    if ((last.lineItems?.length ?? 0) > 0 && catalogItems.length === 0) return
    const picked: Row[] = []
    for (const it of last.lineItems ?? []) {
      const c = catalogItems.find((x) => x.name === it.description)
      if (!c || !(c.paymentType ?? '').trim()) continue
      picked.push(
        toPickedRow(c, {
          quantity: String(it.quantity ?? 1),
          unitPrice: String(it.unitPrice ?? it.amount),
          discount: it.discount ? String(it.discount) : '',
        }),
      )
    }
    setRows(picked)
    setNote(last.note ?? '')
    appliedRef.current = vendorId
    setAppliedVendor(vendorId)
    setShowSuggest(false)
  }, [vendorId, memory.data, catalogItems])

  const markTouched = () => {
    userTouched.current = true
    setShowSuggest(false)
  }

  const lineItems = useMemo(
    () =>
      rows.map((r) =>
        normalizeLineItem({
          description: r.name,
          unit: r.unit,
          quantity: Number(r.quantity),
          unitPrice: Number(r.unitPrice),
          discount: Number(r.discount),
          itemId: r.itemId,
          subItems: r.subItems.filter((_, si) => r.ticked[si]),
        }),
      ),
    [rows],
  )
  const validItems = lineItems.filter((it) => it.description && it.amount > 0)
  const grossNum = itemsTotal(validItems)

  // Tax follows the picked items — never typed. Resolved over priced rows so
  // a zero-amount row can neither block nor sway the result.
  const taxState = useMemo(() => {
    const priced = rows.filter(
      (r) =>
        r.name.trim() &&
        lineTotal({ quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice) || 0, discount: Number(r.discount) || 0 }) > 0,
    )
    if (priced.length === 0) return { status: 'empty' as const }
    const res = resolveTransactionTax(priced.map((r) => ({ paymentType: r.paymentType })))
    if (!res.ok) return { status: 'blocked' as const, error: res.error }
    return { status: 'ready' as const, paymentType: res.paymentType }
  }, [rows])
  const baseRate = taxState.status === 'ready' ? whtRateFor(taxState.paymentType, cfg) : 0
  // มาตรา 50/1 stays server-authoritative too; the form only mirrors it.
  // Deduct-only: the gross-up toggle is gone from the form, so 'deduct' is fixed.
  const effective = useMemo(
    () =>
      taxState.status === 'ready'
        ? applyWhtThreshold(grossNum, baseRate, taxState.paymentType, cfg.whtMinThreshold, false)
        : { rate: 0, paymentType: '', noWht: true },
    [grossNum, taxState, baseRate, cfg.whtMinThreshold],
  )
  const effectiveRate = effective.rate
  const effectivePaymentType = effective.paymentType
  const { gross, wht, net } = useMemo(() => calcWht(grossNum, effectiveRate, 'deduct'), [grossNum, effectiveRate])
  const belowThreshold = belowWhtThreshold(grossNum, cfg.whtMinThreshold)
  const dup = isDuplicateSlipRef(slipRef, existingRefs)
  const TAX_BLOCK_TH: Record<string, string> = {
    'mixed-tax-types': 'รายการที่เลือกมีประเภทภาษีต่างกัน — กรุณาแยกเป็นคนละรายการกัน',
    'missing-item-tax': 'มีรายการที่ยังไม่ได้ตั้งประเภทภาษี — ติดต่อเจ้าของบัญชี',
  }
  const taxBlockedMsg = taxState.status === 'blocked' ? (TAX_BLOCK_TH[taxState.error] ?? 'ประเภทภาษีของรายการไม่ถูกต้อง') : ''
  const selectedVendor = vendors.find((v) => v.id === vendorId)

  const setRow = (key: string, patch: Partial<Row>) => {
    markTouched()
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const toggleTick = (key: string, si: number) => {
    markTouched()
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, ticked: r.ticked.map((t, i) => (i === si ? !t : t)) } : r)),
    )
  }

  const removeRow = (key: string) => {
    markTouched()
    setRows((rs) => rs.filter((r) => r.key !== key))
  }

  const addPickedRow = (c: CatalogItem) => {
    markTouched()
    setRows((rs) => [...rs, toPickedRow(c)])
    setPickerOpen(false)
    setPickerQ('')
  }

  // Recent items for this vendor, mapped back onto catalog entries (only
  // matches are offered — free text no longer exists).
  const suggestItems = useMemo(() => {
    const seen = new Set<string>()
    const out: CatalogItem[] = []
    for (const s of catalog) {
      const c = catalogItems.find((x) => x.name === s.description)
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        out.push(c)
      }
      if (out.length >= 8) break
    }
    return out
  }, [catalog, catalogItems])

  const pickerItems = useMemo(() => {
    const q = pickerQ.trim().toLowerCase()
    return catalogItems.filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [catalogItems, pickerQ])

  const clearAuto = () => {
    userTouched.current = true
    setRows([])
    setNote('')
    setAppliedVendor(null)
    setShowSuggest(false)
  }

  // Verify the entered ID against the vendor registry (when we have it).
  const taxDigits = vendorTaxId.replace(/\D/g, '').length
  const taxMatch = vendorTaxIdMatches(selectedVendor, vendorTaxId)
  const taxError = selectedVendor?.taxId
    ? taxMatch
      ? undefined
      : 'เลขบัตรไม่ตรงกับทะเบียนผู้ขาย'
    : taxDigits !== 13
      ? 'กรุณากรอกเลขบัตรผู้ขายให้ครบ 13 หลัก'
      : undefined

  const errors = {
    items: validItems.length === 0 ? 'เลือกรายการจากคลังอย่างน้อย 1 รายการ' : undefined,
    tax: taxBlockedMsg || undefined,
    slipRef: slipRef.trim() && dup ? 'เลขที่อ้างอิงนี้ถูกใช้แล้ว' : undefined,
    vendorTaxId: taxError,
  }
  const invalid = Object.values(errors).some(Boolean) || !vendorId

  // The one guidance line above the save button: exactly what is still missing.
  const missingBits: string[] = []
  if (!vendorId) missingBits.push('ผู้ขาย')
  if (validItems.length === 0) missingBits.push('รายการ (อีก 1 อย่าง)')

  const submit = () => {
    setTouched(true)
    if (invalid) return
    setConfirmOpen(true)
  }

  const confirmSave = () => {
    setConfirmOpen(false)
    create.mutate(
      {
        vendorId,
        // The server re-derives type/rate from the picked items; these travel
        // along so the stored document matches what was on screen.
        paymentType: effectivePaymentType,
        note,
        lineItems: validItems,
        whtRate: effectiveRate,
        whtMode: 'deduct',
        forceWht: false,
        transferDate,
        slipReference: slipRef,
        slipName,
        vendorTaxId,
      },
      { onSuccess: () => nav('/') },
    )
  }

  if (!can('canManageTransactions')) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="สร้างรายการใหม่"
          sub="ชำระผ่านธนาคาร · เลขที่ใบเสร็จจะออกเมื่อผู้ขายลงนามแล้ว"
          breadcrumb={[{ to: '/', label: 'รายการธุรกรรม' }, { label: 'สร้างรายการใหม่' }]}
        />
        <Card>
          <ErrorState
            title="ไม่มีสิทธิ์สร้างรายการ"
            description="ต้องมีสิทธิ์สร้างและส่งธุรกรรมจึงสร้างรายการใหม่ได้ ติดต่อเจ้าของบัญชี"
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="สร้างรายการใหม่"
        sub="ชำระผ่านธนาคาร · เลขที่ใบเสร็จจะออกเมื่อผู้ขายลงนามแล้ว"
        breadcrumb={[{ to: '/', label: 'รายการธุรกรรม' }, { label: 'สร้างรายการใหม่' }]}
        actions={<HelpLink to="/help#create-transaction" />}
      />

      {/* Single column, top to bottom: with tax auto-derived the sidebar lost
          its job, and one obvious path is the kindest layout for the officer. */}
      <div className="space-y-5">
          <Section step="1" title="ผู้ขาย" desc="จำเป็น — เลือกผู้ขายและยืนยันเลขบัตรประชาชนที่ใช้ล็อกหน้าลงนาม">
            <div>
              <Label>ผู้ขาย</Label>
              <VendorPicker vendors={vendors} value={vendorId} onChange={(id) => setVendorId(id)} />
            </div>

            <div>
              <Label>เลขบัตรประชาชนผู้ขาย</Label>
              <Input
                value={vendorTaxId}
                onChange={(e) => { markTouched(); setVendorTaxId(e.target.value.replace(/\D/g, '').slice(0, 13)) }}
                placeholder="13 หลัก — ใช้ล็อกหน้าผู้ขาย"
                inputMode="numeric"
                className="font-mono"
                invalid={touched && !!errors.vendorTaxId}
              />
              <div className="mt-1.5 text-body">
                {selectedVendor?.taxId ? (
                  taxMatch ? (
                    <p className="flex items-center gap-1.5 font-medium text-success">
                      <ShieldCheck size={14} /> ตรงกับทะเบียนผู้ขาย ({selectedVendor.name})
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 font-medium text-danger">
                      <ShieldAlert size={14} /> เลขบัตรไม่ตรงกับทะเบียนผู้ขาย — ตรวจสอบอีกครั้ง
                    </p>
                  )
                ) : (
                  <p className={taxDigits === 13 ? 'font-medium text-success' : 'text-ink-400'}>
                    {taxDigits === 13 ? 'ครบ 13 หลัก — ใช้เป็นรหัสล็อกหน้าลงนามได้' : `• กรอกแล้ว ${taxDigits}/13 หลัก`}
                  </p>
                )}
              </div>
              {recalledId.data && !selectedVendor?.taxId && recalledId.data === vendorTaxId && (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-control bg-primary-soft px-3 py-2 text-body text-primary-text">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={13} /> เรียกเลขบัตรประชาชนที่บันทึกไว้ (เข้ารหัส) ของ {selectedVendor?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setVendorTaxId(''); idFilledRef.current = vendorId; markTouched() }}
                    className="inline-flex items-center gap-1 rounded-control px-2 py-1 font-semibold hover:bg-primary/10"
                  >
                    <X size={13} /> ล้าง
                  </button>
                </div>
              )}
            </div>
          </Section>

          <Section step="2" title="รายการ" desc="จำเป็น — เลือกรายการจากคลัง ภาษีกำหนดจากรายการอัตโนมัติ">
            {/* Memory: recent catalog items for this vendor */}
            <div aria-live="polite" className="space-y-2">
              {appliedVendor === vendorId && rows.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-control bg-primary-soft px-3.5 py-2.5 text-body text-primary-text">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={14} /> คัดลอกจากรายการล่าสุดของ {selectedVendor?.name}
                  </span>
                  <button type="button" onClick={clearAuto} className="inline-flex items-center gap-1 rounded-control px-2 py-1 font-semibold hover:bg-primary/10">
                    <X size={13} /> ล้าง
                  </button>
                </div>
              )}
              {showSuggest && suggestItems.length > 0 && (
                <div className="rounded-control bg-ink-50 px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-body font-medium text-ink-500">
                    <Sparkles size={14} /> รายการที่ใช้เป็นประจำของ {selectedVendor?.name} — เลือกเพื่อเพิ่ม
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestItems.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addPickedRow(c)}
                        className="rounded-full bg-white px-3 py-1.5 text-body font-medium ring-1 ring-card-border transition hover:ring-primary/40 hover:text-primary-text"
                        aria-label={`เพิ่ม ${c.name} จำนวน ${fmtTHB(c.unitPrice)} บาท`}
                      >
                        {c.name} · {fmtTHB(c.unitPrice)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {pickerOpen ? (
              <div className="rounded-control border border-card-border">
                <div className="border-b border-card-border p-2">
                  <Input value={pickerQ} onChange={(e) => setPickerQ(e.target.value)} placeholder="ค้นหารายการ…" autoFocus />
                </div>
                <ul className="max-h-64 overflow-y-auto p-1.5">
                  {pickerItems.length === 0 && (
                    <li className="px-2.5 py-3 text-body text-ink-500">ไม่พบรายการที่ค้นหา</li>
                  )}
                  {pickerItems.map((c) => {
                    const usable = !!(c.paymentType ?? '').trim()
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={!usable}
                          onClick={() => addPickedRow(c)}
                          className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="block text-label text-ink-500">
                              {usable ? `${c.paymentType} · ${whtRateFor(c.paymentType ?? '', cfg)}%` : 'รอตั้งค่าภาษี — ติดต่อเจ้าของบัญชี'}
                            </span>
                          </span>
                          <span className="shrink-0 text-body tabular-nums text-ink-600">{fmtTHB(c.unitPrice)}</span>
                          {usable && <Plus size={15} className="shrink-0 text-ink-400" aria-hidden />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus size={16} /> เลือกรายการจากคลัง
              </Button>
            )}

            {rows.length > 0 && (
              <div className="space-y-2.5">
                {rows.map((r) => {
                  const rowAmount = lineTotal({
                    quantity: Number(r.quantity) || 0,
                    unitPrice: Number(r.unitPrice) || 0,
                    discount: Number(r.discount) || 0,
                  })
                  return (
                    <div key={r.key} className="rounded-control border border-card-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.name}</p>
                          <p className="mt-0.5 text-label text-ink-500">
                            {r.paymentType} · {whtRateFor(r.paymentType, cfg)}% · {r.unit}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(r.key)}
                          aria-label={`ลบ ${r.name}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-danger"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                      {r.subItems.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.subItems.map((s, si) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleTick(r.key, si)}
                              aria-pressed={r.ticked[si]}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-medium transition',
                                r.ticked[si] ? 'bg-primary-soft text-primary-text' : 'bg-ink-100 text-ink-500',
                              )}
                            >
                              {r.ticked[si] && <Check size={12} aria-hidden />}{s}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <Label>จำนวน</Label>
                          <Input value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} inputMode="decimal" placeholder="1" className="text-right tabular-nums" />
                        </div>
                        <div>
                          <Label>ราคา/หน่วย</Label>
                          <Input value={r.unitPrice} onChange={(e) => setRow(r.key, { unitPrice: e.target.value })} inputMode="decimal" placeholder="0.00" className="text-right tabular-nums" />
                        </div>
                        <div>
                          <Label>ส่วนลด</Label>
                          <Input value={r.discount} onChange={(e) => setRow(r.key, { discount: e.target.value })} inputMode="decimal" placeholder="0" className="text-right tabular-nums" />
                        </div>
                      </div>
                      <p className="mt-1.5 text-right text-body">
                        จำนวนเงิน <b className="tabular-nums">{fmtTHB(rowAmount)}</b>
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Link to="/items" className="text-body font-medium text-ink-500 underline hover:text-ink-900">
                รายการสินค้า/บริการ
              </Link>
              <span className="text-body text-ink-500">
                {validItems.length} รายการ · {fmtTHB(grossNum)}
              </span>
            </div>
            {touched && <FieldError msg={errors.items} />}
            {touched && <FieldError msg={errors.tax} />}

            <div>
              <Label hint="ไม่บังคับ — หัวข้อสรุปเหนือตารางบนใบเสร็จ">บันทึกช่วยจำ</Label>
              <Input value={note} onChange={(e) => { markTouched(); setNote(e.target.value) }} placeholder="เช่น งานซ่อมบำรุงเครื่องปรับอากาศ" />
            </div>
          </Section>

          <Section step="3" title="สรุปและวันที่" desc="ภาษีกำหนดจากรายการอัตโนมัติ">
            <div>
              <Label>ประเภทภาษี</Label>
              {taxState.status === 'ready' ? (
                <p className="flex items-center gap-1.5 font-medium">
                  <Lock size={14} className="shrink-0 text-ink-400" aria-hidden />
                  {taxState.paymentType} · หัก {whtRateFor(taxState.paymentType, cfg)}%
                </p>
              ) : (
                <p className="text-body text-ink-500">จะกำหนดอัตโนมัติเมื่อเลือกรายการ</p>
              )}
            </div>
            <div>
              <Label>วันที่โอน</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>

            <div className="rounded-card bg-ink-50 p-4 text-body">
              <div className="flex justify-between py-0.5">
                <span className="text-ink-500">รวมเป็นเงิน (ฐานภาษี)</span>
                <span className="font-semibold tabular-nums">{fmtTHB(gross)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-ink-500">หัก WHT ({effectiveRate}%)</span>
                <span className="font-semibold tabular-nums text-ink-500">− {fmtTHB(wht)}</span>
              </div>
              <div className="mt-1.5 flex justify-between border-t border-card-border pt-2">
                <span className="font-semibold">ยอดสุทธิที่ผู้ขายได้รับ</span>
                <span className="text-lg font-semibold tabular-nums">{fmtTHB(net)}</span>
              </div>
              {belowThreshold && grossNum > 0 && (
                <div className="mt-3 rounded-control bg-primary-soft p-3 text-body text-primary-text">
                  <p className="flex gap-2 font-medium">
                    <Info size={16} className="mt-0.5 shrink-0" />
                    ยอด {fmtTHB(gross)} ต่ำกว่าเกณฑ์ {fmtTHB(cfg.whtMinThreshold)} — ไม่หักภาษี ณ ที่จ่าย (มาตรา 50/1)
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section step="4" title="เอกสารอ้างอิง" desc="ไม่บังคับ — แนบภายหลังได้">
            <div>
              <Label>เลขที่อ้างอิงสลิป</Label>
              <Input value={slipRef} onChange={(e) => setSlipRef(e.target.value)} placeholder="เช่น TRF-881201" className="font-mono" invalid={touched && !!errors.slipRef} />
              {touched && <FieldError msg={errors.slipRef} />}
              {slipRef && !dup && <p className="mt-1.5 text-body text-success">เลขที่อ้างอิงนี้ยังไม่ถูกใช้ในระบบ</p>}
            </div>
            <div>
              <Label>สลิปโอนเงิน</Label>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-control border border-dashed border-ink-300 bg-ink-50 px-3.5 text-body font-medium text-ink-700 hover:border-ink-900">
                <UploadCloud size={17} />
                <span className="truncate">{slipName || 'เลือกไฟล์สลิป…'}</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => setSlipName(e.target.files?.[0]?.name ?? '')}
                />
              </label>
            </div>
          </Section>

          {create.isError && <FieldError msg={(create.error as Error).message} />}

          {missingBits.length > 0 && (
            <p className="text-body text-ink-500" aria-live="polite">
              ยังต้องกรอก: {missingBits.join(' · ')}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row max-sm:sticky max-sm:bottom-2 max-sm:rounded-control max-sm:border max-sm:border-card-border max-sm:bg-white/95 max-sm:p-2 max-sm:shadow-card">
            <Button variant="ghost" onClick={() => nav(-1)} className="sm:flex-1">
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={create.isPending} disabled={invalid} className="sm:flex-[2]">
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
            </Button>
          </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        size="lg"
        title="ตรวจสอบรายการก่อนบันทึก"
        confirmLabel="ยืนยันบันทึก"
        busy={create.isPending}
        onConfirm={confirmSave}
        onCancel={() => setConfirmOpen(false)}
        message={
          <div className="space-y-3 text-ink-700">
            <div className="rounded-control bg-ink-50 p-3.5 text-body">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink-500">ผู้ขาย</p>
                  <p className="truncate font-semibold">{vendorDisplayName(selectedVendor?.prefix, selectedVendor?.name)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-ink-500">วันที่โอน</p>
                  <p className="font-semibold">{fmtDateTH(transferDate)}</p>
                </div>
              </div>
              <p className="mt-2 text-ink-500">ประเภทการจ่าย · {effectivePaymentType || '—'}</p>
              {note.trim() && <p className="mt-0.5 text-ink-500">บันทึกช่วยจำ · {note.trim()}</p>}
            </div>

            <div className="divide-y divide-ink-100 rounded-control border border-card-border">
              <div className="flex items-baseline gap-2 bg-ink-50/70 px-3 py-1.5 text-label font-medium text-ink-500">
                <span className="min-w-0 flex-1">รายละเอียด</span>
                <span className="w-10 shrink-0 text-right">จำนวน</span>
                <span className="w-16 shrink-0 text-right">หน่วย</span>
                <span className="w-24 shrink-0 text-right">ราคา/หน่วย</span>
                <span className="w-24 shrink-0 text-right">จำนวนเงิน</span>
              </div>
              {validItems.map((it, i) => (
                <div key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-body">
                  <span className="min-w-0 flex-1 truncate">{it.description}</span>
                  <span className="w-10 shrink-0 text-right tabular-nums">{it.quantity ?? 1}</span>
                  <span className="w-16 shrink-0 text-right text-ink-500">{it.unit || 'รายการ'}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums">{fmtTHB(it.unitPrice ?? it.amount)}</span>
                  <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmtTHB(it.amount)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-0.5 rounded-control bg-ink-50 p-3.5 text-body">
              <div className="flex justify-between">
                <span className="text-ink-500">รวมเป็นเงิน (ฐานภาษี)</span>
                <span className="font-semibold tabular-nums">{fmtTHB(gross)}</span>
              </div>
              {wht > 0 && (
                <div className="flex justify-between">
                    <span className="text-ink-500">หักภาษี ณ ที่จ่าย {effectiveRate}%</span>
                  <span className="font-semibold tabular-nums text-ink-500">− {fmtTHB(wht)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-card-border pt-1.5">
                <span className="font-semibold">ยอดสุทธิที่ผู้ขายได้รับ</span>
                <span className="text-base font-semibold tabular-nums">{fmtTHB(net)}</span>
              </div>
            </div>

            {(slipRef.trim() || slipName) && (
              <p className="text-body text-ink-500">
                เอกสารอ้างอิง · {slipRef.trim() || '—'}{slipName ? ` · ${slipName}` : ''}
              </p>
            )}
            <p className="text-label text-ink-400">
              เมื่อบันทึกแล้ว ระบบจะสร้างลิงก์สำหรับส่งให้ผู้ขายลงนาม (เอกสารแก้ไข/ลบไม่ได้ แต่ยกเลิกได้)
            </p>
          </div>
        }
      />
    </div>
  )
}
