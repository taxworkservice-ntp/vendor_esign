import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Info, Plus, ShieldAlert, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import { PILOT_CONFIG, calcWht, isDuplicateSlipRef } from '../lib/config'
import { applyWhtThreshold, belowWhtThreshold } from '../lib/wht-calc'
import { defaultSettings, whtRateFor } from '../lib/settings'
import { itemsTotal, lineTotal, normalizeLineItem } from '../lib/line-items'
import { vendorTaxIdMatches } from '../lib/vendor-match'
import { vendorDisplayName } from '../lib/vendor-name'
import { useAllSlipRefs, useCreateTransaction } from '../hooks/useTransactions'
import { useAllVendors, useRecalledVendorId, useVendorMemory } from '../hooks/useVendors'
import { useAllItems } from '../hooks/useItems'
import { useSettings } from '../hooks/useSettings'
import { VendorPicker } from '../components/vendor-picker'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { todayISO } from '../lib/txn-filters'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { cn } from '../lib/cn'
import type { LineItem, WhtMode } from '../lib/types'

interface Row {
  description: string
  unit: string
  quantity: string
  unitPrice: string
  discount: string
}

const EMPTY_ROW: Row = { description: '', unit: 'รายการ', quantity: '1', unitPrice: '', discount: '' }

const CATALOG_DATALIST = 'vendor-item-catalog'

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
  const create = useCreateTransaction()
  const existingRefs = useAllSlipRefs()
  const vendors = useAllVendors()
  const catalogItems = useAllItems()
  const { data: settings } = useSettings()
  const cfg = settings ?? defaultSettings()

  // No vendor preselected — the user must choose one explicitly.
  const [vendorId, setVendorId] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }])
  const [note, setNote] = useState('')
  const [whtRate, setWhtRate] = useState(0)
  const [whtMode, setWhtMode] = useState<WhtMode>('deduct')
  // Continuous-contract escape: withhold even when gross < whtMinThreshold.
  const [forceWht, setForceWht] = useState(false)
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
  const catalogByDesc = useMemo(() => new Map(catalog.map((i) => [i.description, i.lastAmount])), [catalog])

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

  useEffect(() => {
    const last = memory.data?.last
    if (!last || appliedRef.current === vendorId) return
    if (userTouched.current) {
      setShowSuggest(true)
      return
    }
    setRows(
      last.lineItems.length
        ? last.lineItems.map((it) => ({
            description: it.description,
            unit: it.unit ?? '',
            quantity: String(it.quantity ?? 1),
            unitPrice: String(it.unitPrice ?? it.amount),
            discount: it.discount ? String(it.discount) : '',
          }))
        : [{ ...EMPTY_ROW }],
    )
    setPaymentType(last.paymentType || cfg.paymentTypes[0])
    setWhtRate(last.whtRate ?? whtRateFor(last.paymentType, cfg))
    setWhtMode(last.whtMode ?? 'deduct')
    setNote(last.note ?? '')
    appliedRef.current = vendorId
    setAppliedVendor(vendorId)
    setShowSuggest(false)
  }, [vendorId, memory.data])

  // Seed the default payment type + WHT from settings once loaded.
  useEffect(() => {
    if (!paymentType && cfg.paymentTypes[0]) {
      setPaymentType(cfg.paymentTypes[0])
      setWhtRate(whtRateFor(cfg.paymentTypes[0], cfg))
    }
  }, [cfg, paymentType])

  const markTouched = () => {
    userTouched.current = true
    setShowSuggest(false)
  }

  const lineItems = useMemo(
    () =>
      rows.map((r) =>
        normalizeLineItem({
          description: r.description,
          unit: r.unit,
          quantity: Number(r.quantity),
          unitPrice: Number(r.unitPrice),
          discount: Number(r.discount),
        }),
      ),
    [rows],
  )
  const validItems = lineItems.filter((it) => it.description && it.amount > 0)
  const grossNum = itemsTotal(validItems)

  // มาตรา 50/1: below the tenant's minimum, WHT is waived and the income is
  // reclassified — unless the user forces withholding for a continuous contract.
  const belowThreshold = belowWhtThreshold(grossNum, cfg.whtMinThreshold)
  const effective = useMemo(
    () => applyWhtThreshold(grossNum, whtRate, paymentType, cfg.whtMinThreshold, forceWht),
    [grossNum, whtRate, paymentType, cfg.whtMinThreshold, forceWht],
  )
  const effectiveRate = effective.rate
  const effectivePaymentType = effective.paymentType
  const { gross, wht, net } = useMemo(() => calcWht(grossNum, effectiveRate, whtMode), [grossNum, effectiveRate, whtMode])
  const dup = isDuplicateSlipRef(slipRef, existingRefs)
  const whtMismatch = grossNum > 0 && !cfg.whtRates.some((r) => r.value === whtRate)
  // Show the force control only when the rule is actually zeroing a positive rate.
  const showForceToggle = belowThreshold && whtRate > 0
  const selectedVendor = vendors.find((v) => v.id === vendorId)

  const setRow = (i: number, patch: Partial<Row>) => {
    markTouched()
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const changePaymentType = (pt: string) => {
    markTouched()
    setForceWht(false)
    setPaymentType(pt)
    setWhtRate(whtRateFor(pt, cfg))
  }

  // Typing a catalog name fills unit/price; else fall back to the vendor's last price.
  const onDescriptionChange = (i: number, value: string) => {
    const row = rows[i]
    const patch: Partial<Row> = { description: value }
    const cat = catalogItems.find((c) => c.name === value)
    if (cat) {
      if (!row.unit.trim()) patch.unit = cat.unit
      if (!row.unitPrice.trim()) patch.unitPrice = String(cat.unitPrice)
    } else if (!row.unitPrice.trim()) {
      const known = catalogByDesc.get(value)
      if (known != null) patch.unitPrice = String(known)
    }
    setRow(i, patch)
  }

  const addCatalogRow = (it: LineItem) => {
    markTouched()
    const row: Row = {
      description: it.description,
      unit: it.unit ?? '',
      quantity: String(it.quantity ?? 1),
      unitPrice: String(it.unitPrice ?? it.amount),
      discount: it.discount ? String(it.discount) : '',
    }
    setRows((rs) => [...rs.filter((r) => r.description || r.unitPrice), row])
  }

  const clearAuto = () => {
    userTouched.current = true
    setRows([{ ...EMPTY_ROW }])
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
    items: grossNum <= 0 ? 'เพิ่มรายการอย่างน้อย 1 บรรทัด (รายละเอียด + จำนวนเงิน)' : undefined,
    slipRef: slipRef.trim() && dup ? 'เลขที่อ้างอิงนี้ถูกใช้แล้ว' : undefined,
    vendorTaxId: taxError,
  }
  const invalid = Object.values(errors).some(Boolean) || !vendorId

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
        // Send the effective values so the stored document matches what was on
        // screen; `forceWht` lets the server re-derive the same result safely.
        paymentType: effectivePaymentType,
        note,
        lineItems: validItems,
        whtRate: effectiveRate,
        whtMode,
        forceWht,
        transferDate,
        slipReference: slipRef,
        slipName,
        vendorTaxId,
      },
      { onSuccess: () => nav('/') },
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="สร้างรายการใหม่" sub="ชำระผ่านธนาคาร · เลขที่ใบเสร็จจะออกเมื่อผู้ขายลงนามแล้ว" />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ── Main column ── */}
        <div className="space-y-5">
          <Section step="1" title="ผู้ขาย" desc="เลือกผู้ขายและยืนยันเลขบัตรประชาชนที่ใช้ล็อกหน้าลงนาม">
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

          <Section step="2" title="รายการ" desc="แต่ละบรรทัดจะพิมพ์เป็นรายการบนใบเสร็จ">
            {/* Memory: auto-fill chip / suggestions */}
            <div aria-live="polite" className="space-y-2">
              {appliedVendor === vendorId && rows.some((r) => r.description) && (
                <div className="flex items-center justify-between gap-2 rounded-control bg-primary-soft px-3.5 py-2.5 text-body text-primary-text">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={14} /> คัดลอกจากรายการล่าสุดของ {selectedVendor?.name}
                  </span>
                  <button type="button" onClick={clearAuto} className="inline-flex items-center gap-1 rounded-control px-2 py-1 font-semibold hover:bg-primary/10">
                    <X size={13} /> ล้าง
                  </button>
                </div>
              )}
              {showSuggest && catalog.length > 0 && (
                <div className="rounded-control bg-ink-50 px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-body font-medium text-ink-500">
                    <Sparkles size={14} /> รายการที่ใช้เป็นประจำของ {selectedVendor?.name} — เลือกเพื่อเพิ่มรายการ
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {catalog.slice(0, 8).map((it) => (
                      <button
                        key={it.description}
                        type="button"
                        onClick={() => addCatalogRow({ description: it.description, amount: it.lastAmount })}
                        className="rounded-full bg-white px-3 py-1.5 text-body font-medium ring-1 ring-card-border transition hover:ring-primary/40 hover:text-primary-text"
                        title={`ใช้ ${it.timesUsed} ครั้ง`}
                        aria-label={`เพิ่ม ${it.description} จำนวน ${it.lastAmount} บาท`}
                      >
                        {it.description} · {fmtTHB(it.lastAmount)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <datalist id={CATALOG_DATALIST}>
              {catalogItems.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
              {catalog.map((it) => (
                <option key={it.description} value={it.description} />
              ))}
            </datalist>

            <div className="overflow-x-auto rounded-control border border-card-border">
              <div className="min-w-[820px]">
                <div className="flex items-center gap-2 border-b border-card-border bg-ink-50/80 px-3 py-2 text-label font-medium text-ink-500">
                  <span className="w-6 shrink-0 text-right">#</span>
                  <span className="min-w-[160px] flex-1">รายละเอียด</span>
                  <span className="w-14 shrink-0 text-right">จำนวน</span>
                  <span className="w-24 shrink-0">หน่วย</span>
                  <span className="w-24 shrink-0 text-right">ราคา/หน่วย</span>
                  <span className="w-20 shrink-0 text-right">ส่วนลด</span>
                  <span className="w-24 shrink-0 text-right">จำนวนเงิน (บาท)</span>
                  <span className="w-8 shrink-0" />
                </div>
                <div className="divide-y divide-ink-100">
                  {rows.map((r, i) => {
                    const rowAmount = lineTotal({
                      quantity: Number(r.quantity),
                      unitPrice: Number(r.unitPrice),
                      discount: Number(r.discount),
                    })
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-6 shrink-0 text-right font-mono text-body text-ink-400">{i + 1}</span>
                        <input
                          value={r.description}
                          onChange={(e) => onDescriptionChange(i, e.target.value)}
                          placeholder="รายละเอียดงาน / บริการ"
                          list={CATALOG_DATALIST}
                          className="h-10 min-w-[160px] flex-1 rounded-control border border-transparent bg-transparent px-2 text-body outline-none placeholder:text-ink-400 focus:border-ink-300 focus:bg-white"
                        />
                        <input
                          value={r.quantity}
                          onChange={(e) => setRow(i, { quantity: e.target.value })}
                          inputMode="decimal"
                          placeholder="1"
                          className="h-10 w-14 shrink-0 rounded-control border border-transparent bg-transparent px-1.5 text-right text-body tabular-nums outline-none placeholder:text-ink-400 focus:border-ink-300 focus:bg-white"
                        />
                        <input
                          value={r.unit}
                          onChange={(e) => setRow(i, { unit: e.target.value })}
                          placeholder="รายการ"
                          className="h-10 w-24 shrink-0 rounded-control border border-transparent bg-transparent px-1.5 text-body text-ink-600 outline-none placeholder:text-ink-400 focus:border-ink-300 focus:bg-white"
                        />
                        <input
                          value={r.unitPrice}
                          onChange={(e) => setRow(i, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-10 w-24 shrink-0 rounded-control border border-transparent bg-transparent px-2 text-right text-body tabular-nums outline-none placeholder:text-ink-400 focus:border-ink-300 focus:bg-white"
                        />
                        <input
                          value={r.discount}
                          onChange={(e) => setRow(i, { discount: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          className="h-10 w-20 shrink-0 rounded-control border border-transparent bg-transparent px-2 text-right text-body tabular-nums outline-none placeholder:text-ink-400 focus:border-ink-300 focus:bg-white"
                        />
                        <span className="w-24 shrink-0 text-right text-body font-semibold tabular-nums">{fmtTHB(rowAmount)}</span>
                        <button
                          type="button"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                          disabled={rows.length === 1}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-400 hover:bg-ink-100 hover:text-danger disabled:opacity-30"
                          title="ลบบรรทัด"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-card-border bg-ink-50/50 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
                      className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-body font-semibold text-ink-700 hover:bg-ink-100"
                    >
                      <Plus size={15} /> เพิ่มบรรทัด
                    </button>
                    <Link to="/items" className="text-body font-medium text-ink-500 underline hover:text-ink-900">
                      รายการสินค้า/บริการ
                    </Link>
                  </div>
                  <span className="text-body text-ink-500">
                    {validItems.length} รายการ · {fmtTHB(grossNum)}
                  </span>
                </div>
              </div>
            </div>
            {touched && <FieldError msg={errors.items} />}

            <div>
              <Label hint="ไม่บังคับ — หัวข้อสรุปเหนือตารางบนใบเสร็จ">บันทึกช่วยจำ</Label>
              <Input value={note} onChange={(e) => { markTouched(); setNote(e.target.value) }} placeholder="เช่น งานซ่อมบำรุงเครื่องปรับอากาศ" />
            </div>
          </Section>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Section step="3" title="การชำระเงิน" desc="ยอดและอัตราภาษีหัก ณ ที่จ่าย">
            <div>
              <Label>ประเภทการจ่าย</Label>
              <Select value={effectivePaymentType} onChange={(e) => changePaymentType(e.target.value)}>
                {cfg.whtRates.map((r) => (
                  <option key={r.paymentType} value={r.paymentType}>
                    {r.paymentType}{r.value > 0 ? ` (${r.value}%)` : ' (ไม่หักภาษี)'}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label hint="ผู้ขายรับเต็มจำนวน = ผู้จ่ายรับภาระภาษีหัก ณ ที่จ่ายแทน">วิธีคิดภาษีหัก ณ ที่จ่าย</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-control bg-ink-100 p-1">
                {([['deduct', 'หักจากยอดชำระ'], ['grossup', 'ผู้ขายรับเต็มจำนวน']] as const).map(([v, th]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { markTouched(); setWhtMode(v) }}
                    className={cn(
                      'rounded-control px-3 py-2 text-body transition',
                      // The selected segment lifts off the track, so it takes the
                      // accent-tinted treatment used elsewhere for selection rather
                      // than the near-black fill these used to have.
                      whtMode === v
                        ? 'bg-primary-soft font-semibold text-primary-text'
                        : 'font-medium text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {th}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-label text-ink-500">
                {whtMode === 'deduct'
                  ? `หักภาษี ณ ที่จ่าย ${effectiveRate}% จากยอดชำระ → ผู้ขายได้รับ ${fmtTHB(net)}`
                  : `ผู้ขายได้รับเต็มจำนวน ${fmtTHB(net)} · บวกภาษีหัก ณ ที่จ่าย ${effectiveRate}% → ผู้จ่ายจ่ายรวม ${fmtTHB(gross)}`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>อัตราภาษีหัก ณ ที่จ่าย (%)</Label>
                <Select
                  value={effectiveRate}
                  disabled={belowThreshold && !forceWht}
                  onChange={(e) => { markTouched(); setWhtRate(Number(e.target.value)) }}
                >
                  {Array.from(new Map(cfg.whtRates.map((r) => [r.value, r])).values()).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value}%{r.value === 0 ? ' (ไม่หักภาษี)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>วันที่โอน</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </div>
            </div>

            <div className="rounded-card bg-ink-50 p-4 text-body">
              {whtMode === 'deduct' ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">ผู้ขายได้รับ (เต็ม)</span>
                    <span className="font-semibold tabular-nums">{fmtTHB(net)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">บวก WHT ({effectiveRate}%)</span>
                    <span className="font-semibold tabular-nums text-ink-500">+ {fmtTHB(wht)}</span>
                  </div>
                  <div className="mt-1.5 flex justify-between border-t border-card-border pt-2">
                    <span className="font-semibold">ยอดจ่ายรวม (ฐานภาษี)</span>
                    <span className="text-lg font-semibold tabular-nums">{fmtTHB(gross)}</span>
                  </div>
                </>
              )}
              {belowThreshold && (
                <div className="mt-3 rounded-control bg-primary-soft p-3 text-body text-primary-text">
                  <p className="flex gap-2 font-medium">
                    <Info size={16} className="mt-0.5 shrink-0" />
                    ยอด {fmtTHB(gross)} ต่ำกว่าเกณฑ์ {fmtTHB(cfg.whtMinThreshold)} — ไม่หักภาษี ณ ที่จ่าย (มาตรา 50/1)
                  </p>
                  {showForceToggle && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-ink-700">
                      <input
                        type="checkbox"
                        checked={forceWht}
                        onChange={(e) => { markTouched(); setForceWht(e.target.checked) }}
                        className="h-4 w-4"
                      />
                      หักภาษี ณ ที่จ่ายสำหรับสัญญาต่อเนื่อง
                    </label>
                  )}
                </div>
              )}
              {whtMismatch && <FieldError msg="อัตราภาษีหัก ณ ที่จ่ายไม่อยู่ในค่ามาตรฐาน — ระบบจะทำเครื่องหมายให้ตรวจสอบ" />}
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => nav(-1)} className="sm:flex-1">
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={create.isPending} className="sm:flex-[2]">
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
            </Button>
          </div>
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
              <p className="mt-2 text-ink-500">ประเภทการจ่าย · {paymentType || '—'}</p>
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
                  <span className="text-ink-500">หักภาษี ณ ที่จ่าย {whtRate}%</span>
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
