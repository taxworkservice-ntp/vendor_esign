import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ShieldAlert, ShieldCheck, Sparkles, Trash2, TriangleAlert, UploadCloud, X } from 'lucide-react'
import { PILOT_CONFIG, calcWht, isDuplicateSlipRef } from '../lib/config'
import { defaultSettings, whtRateFor } from '../lib/settings'
import { itemsTotal, lineTotal, normalizeLineItem } from '../lib/line-items'
import { vendorTaxIdMatches } from '../lib/vendor-match'
import { useAllSlipRefs, useCreateTransaction } from '../hooks/useTransactions'
import { useAllVendors, useRecalledVendorId, useVendorMemory } from '../hooks/useVendors'
import { useAllItems } from '../hooks/useItems'
import { useSettings } from '../hooks/useSettings'
import { VendorPicker } from '../components/vendor-picker'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label, inputCls } from '../components/ui/input'
import { fmtTHB } from '../lib/format'
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
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-[13px] font-bold text-white">
            {step}
          </span>
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
  const [transferDate, setTransferDate] = useState('2026-09-28')
  const [slipRef, setSlipRef] = useState('')
  const [slipName, setSlipName] = useState('')
  const [vendorTaxId, setVendorTaxId] = useState('')
  const [touched, setTouched] = useState(false)

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
    setPaymentType(last.paymentType || cfg.paymentTypes[0] || PILOT_CONFIG.paymentTypes[0])
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
  const { gross, wht, net } = useMemo(() => calcWht(grossNum, whtRate, whtMode), [grossNum, whtRate, whtMode])
  const dup = isDuplicateSlipRef(slipRef, existingRefs)
  const whtMismatch = grossNum > 0 && !cfg.whtRates.some((r) => r.value === whtRate)
  const selectedVendor = vendors.find((v) => v.id === vendorId)

  const setRow = (i: number, patch: Partial<Row>) => {
    markTouched()
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const changePaymentType = (pt: string) => {
    markTouched()
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
    create.mutate(
      {
        vendorId,
        paymentType,
        note,
        lineItems: validItems,
        whtRate,
        whtMode,
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
      <PageHeader title="สร้างรายการใหม่" sub="ชำระผ่านธนาคาร · เลขที่ใบเสร็จออกเมื่อผู้ขายลงนามแล้ว" />

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
              />
              <div className="mt-1.5 text-[13px]">
                {selectedVendor?.taxId ? (
                  taxMatch ? (
                    <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                      <ShieldCheck size={14} /> ตรงกับทะเบียนผู้ขาย ({selectedVendor.name})
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 font-medium text-red-600">
                      <ShieldAlert size={14} /> เลขบัตรไม่ตรงกับทะเบียนผู้ขาย — ตรวจสอบอีกครั้ง
                    </p>
                  )
                ) : (
                  <p className={taxDigits === 13 ? 'font-medium text-emerald-600' : 'text-ink-400'}>
                    {taxDigits === 13 ? '✓ ครบ 13 หลัก — ใช้ล็อกหน้าผู้ขายได้' : `• ครบ 13 หลัก (${taxDigits}/13)`}
                  </p>
                )}
              </div>
              {recalledId.data && !selectedVendor?.taxId && recalledId.data === vendorTaxId && (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-teal-50 px-3 py-2 text-[13px] text-teal-800">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={13} /> ดึงเลขบัตรที่บันทึกไว้ (เข้ารหัส) ของ {selectedVendor?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setVendorTaxId(''); idFilledRef.current = vendorId; markTouched() }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-teal-100"
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
                <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-50 px-3.5 py-2.5 text-[13px] text-teal-800">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles size={14} /> ดึงจากรายการล่าสุดของ {selectedVendor?.name}
                  </span>
                  <button type="button" onClick={clearAuto} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-teal-100">
                    <X size={13} /> ล้าง
                  </button>
                </div>
              )}
              {showSuggest && catalog.length > 0 && (
                <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-500">
                    <Sparkles size={14} /> รายการที่ใช้บ่อยของ {selectedVendor?.name} — เลือกเพื่อเพิ่มรายการ
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {catalog.slice(0, 8).map((it) => (
                      <button
                        key={it.description}
                        type="button"
                        onClick={() => addCatalogRow({ description: it.description, amount: it.lastAmount })}
                        className="rounded-full bg-white px-3 py-1.5 text-[13px] font-medium shadow-sm ring-1 ring-slate-200 hover:ring-ink-900"
                        title={`ใช้ ${it.timesUsed} ครั้ง`}
                        aria-label={`เพิ่ม ${it.description} จำนวน ${it.lastAmount} บาท`}
                      >
                        {it.description} · ฿{fmtTHB(it.lastAmount)}
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

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <div className="min-w-[820px]">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <span className="w-6 shrink-0 text-right">#</span>
                  <span className="min-w-[160px] flex-1">รายละเอียด</span>
                  <span className="w-40 shrink-0">จำนวน</span>
                  <span className="w-24 shrink-0 text-right">ราคา</span>
                  <span className="w-20 shrink-0 text-right">ส่วนลด</span>
                  <span className="w-24 shrink-0 text-right">จำนวนเงิน (฿)</span>
                  <span className="w-8 shrink-0" />
                </div>
                <div className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const rowAmount = lineTotal({
                      quantity: Number(r.quantity),
                      unitPrice: Number(r.unitPrice),
                      discount: Number(r.discount),
                    })
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-6 shrink-0 text-right font-mono text-[13px] text-ink-400">{i + 1}</span>
                        <input
                          value={r.description}
                          onChange={(e) => onDescriptionChange(i, e.target.value)}
                          placeholder="รายละเอียดงาน / บริการ"
                          list={CATALOG_DATALIST}
                          className="h-10 min-w-[160px] flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-400 focus:border-slate-300 focus:bg-white"
                        />
                        <div className="flex w-40 shrink-0 items-center gap-1">
                          <input
                            value={r.quantity}
                            onChange={(e) => setRow(i, { quantity: e.target.value })}
                            inputMode="decimal"
                            placeholder="1"
                            className="h-10 w-14 shrink-0 rounded-lg border border-transparent bg-transparent px-1.5 text-right text-[14px] tabular-nums outline-none placeholder:text-ink-400 focus:border-slate-300 focus:bg-white"
                          />
                          <input
                            value={r.unit}
                            onChange={(e) => setRow(i, { unit: e.target.value })}
                            placeholder="รายการ"
                            className="h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-[14px] text-ink-600 outline-none placeholder:text-ink-400 focus:border-slate-300 focus:bg-white"
                          />
                        </div>
                        <input
                          value={r.unitPrice}
                          onChange={(e) => setRow(i, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-10 w-24 shrink-0 rounded-lg border border-transparent bg-transparent px-2 text-right text-[14px] tabular-nums outline-none placeholder:text-ink-400 focus:border-slate-300 focus:bg-white"
                        />
                        <input
                          value={r.discount}
                          onChange={(e) => setRow(i, { discount: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          className="h-10 w-20 shrink-0 rounded-lg border border-transparent bg-transparent px-2 text-right text-[14px] tabular-nums outline-none placeholder:text-ink-400 focus:border-slate-300 focus:bg-white"
                        />
                        <span className="w-24 shrink-0 text-right text-[14px] font-semibold tabular-nums">฿{fmtTHB(rowAmount)}</span>
                        <button
                          type="button"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                          disabled={rows.length === 1}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                          title="ลบบรรทัด"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-700 hover:bg-slate-100"
                    >
                      <Plus size={15} /> เพิ่มบรรทัด
                    </button>
                    <Link to="/items" className="text-[13px] font-semibold text-ink-500 underline hover:text-ink-900">
                      แคตตาล็อก
                    </Link>
                  </div>
                  <span className="text-[13px] text-ink-500">
                    {validItems.length} รายการ · ฿{fmtTHB(grossNum)}
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
              <select className={inputCls} value={paymentType} onChange={(e) => changePaymentType(e.target.value)}>
                {cfg.paymentTypes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <Label hint="ผู้ขายรับเต็ม = ผู้จ่ายรับภาระ WHT ให้">วิธีคิด WHT</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                {([['deduct', 'หักจากยอด'], ['grossup', 'ผู้ขายรับเต็ม']] as const).map(([v, th]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { markTouched(); setWhtMode(v) }}
                    className={cn(
                      'rounded-lg px-3 py-2 text-[13px] font-semibold transition',
                      whtMode === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {th}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-ink-500">
                {whtMode === 'deduct'
                  ? `หัก ณ ที่จ่าย ${whtRate}% จากยอด → ผู้ขายได้รับ ฿${fmtTHB(net)}`
                  : `ผู้ขายได้รับเต็ม ฿${fmtTHB(net)} · บวก WHT ${whtRate}% → ผู้จ่ายจ่ายรวม ฿${fmtTHB(gross)}`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WHT %</Label>
                <select className={inputCls} value={whtRate} onChange={(e) => { markTouched(); setWhtRate(Number(e.target.value)) }}>
                  {cfg.whtRates.map((r) => (
                    <option key={`${r.paymentType}-${r.value}`} value={r.value}>
                      {r.label || `${r.paymentType} — ${r.value}%`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>วันที่โอน</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-[15px]">
              {whtMode === 'deduct' ? (
                <>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">รวมเป็นเงิน (ฐานภาษี)</span>
                    <span className="font-semibold tabular-nums">฿{fmtTHB(gross)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">หัก WHT ({whtRate}%)</span>
                    <span className="font-semibold tabular-nums text-ink-500">− ฿{fmtTHB(wht)}</span>
                  </div>
                  <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-2">
                    <span className="font-bold">ยอดสุทธิที่ผู้ขายได้รับ</span>
                    <span className="text-lg font-bold tabular-nums">฿{fmtTHB(net)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">ผู้ขายได้รับ (เต็ม)</span>
                    <span className="font-semibold tabular-nums">฿{fmtTHB(net)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-ink-500">บวก WHT ({whtRate}%)</span>
                    <span className="font-semibold tabular-nums text-ink-500">+ ฿{fmtTHB(wht)}</span>
                  </div>
                  <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-2">
                    <span className="font-bold">ยอดจ่ายรวม (ฐานภาษี)</span>
                    <span className="text-lg font-bold tabular-nums">฿{fmtTHB(gross)}</span>
                  </div>
                </>
              )}
              {gross >= cfg.stampDutyWarningThreshold && (
                <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] font-medium text-amber-800">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  ยอดเกิน ฿{fmtTHB(cfg.stampDutyWarningThreshold)} — โปรดตรวจสอบอากรแสตมป์กับนักบัญชีก่อนออกเอกสาร
                </p>
              )}
              {whtMismatch && <FieldError msg="อัตราภาษีหัก ณ ที่จ่ายไม่อยู่ในค่ามาตรฐาน — ระบบจะทำเครื่องหมายให้ตรวจสอบ" />}
            </div>
          </Section>

          <Section step="4" title="เอกสารอ้างอิง" desc="ไม่บังคับ — แนบภายหลังได้">
            <div>
              <Label>เลขที่อ้างอิงสลิป</Label>
              <Input value={slipRef} onChange={(e) => setSlipRef(e.target.value)} placeholder="เช่น TRF-881201" className="font-mono" />
              {touched && <FieldError msg={errors.slipRef} />}
              {slipRef && !dup && <p className="mt-1.5 text-[13px] text-emerald-600">เลขนี้ยังไม่ซ้ำ ✓</p>}
            </div>
            <div>
              <Label>สลิปโอนเงิน</Label>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 text-sm font-medium text-ink-700 hover:border-ink-900">
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
            <Button onClick={submit} disabled={create.isPending} className="sm:flex-[2]">
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
