import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert, UploadCloud } from 'lucide-react'
import { PILOT_CONFIG, calcWht, isDuplicateSlipRef } from '../lib/config'
import { validateThaiId } from '../lib/thai-words'
import { VENDORS } from '../lib/mock'
import { useAllSlipRefs, useCreateTransaction } from '../hooks/useTransactions'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label, inputCls } from '../components/ui/input'
import { fmtTHB } from '../lib/format'

export function TransactionNew() {
  const nav = useNavigate()
  const create = useCreateTransaction()
  const existingRefs = useAllSlipRefs()

  const [vendorId, setVendorId] = useState(VENDORS[0].id)
  const [paymentType, setPaymentType] = useState(PILOT_CONFIG.paymentTypes[0])
  const [description, setDescription] = useState('')
  const [gross, setGross] = useState('3000')
  const [whtRate, setWhtRate] = useState(3)
  const [transferDate, setTransferDate] = useState('2026-09-28')
  const [slipRef, setSlipRef] = useState('')
  const [slipName, setSlipName] = useState('')
  const [vendorTaxId, setVendorTaxId] = useState('')
  const [touched, setTouched] = useState(false)

  const grossNum = Number(gross) || 0
  const { wht, net } = useMemo(() => calcWht(grossNum, whtRate), [grossNum, whtRate])
  const dup = isDuplicateSlipRef(slipRef, existingRefs)
  const whtMismatch = grossNum > 0 && ![0, 1, 3, 5].includes(whtRate)

  const errors = {
    description: description.trim().length < 4 ? 'ระบุรายละเอียดอย่างน้อย 4 ตัวอักษร' : undefined,
    gross: grossNum <= 0 ? 'ยอด gross ต้องมากกว่า 0' : undefined,
    slipRef: slipRef.trim() && dup ? 'เลขที่อ้างอิงนี้ถูกใช้แล้ว' : undefined,
    vendorTaxId:
      vendorTaxId.trim() === ''
        ? 'กรุณากรอกเลขบัตรผู้ขาย 13 หลัก (จำเป็น — ใช้ล็อกหน้าผู้ขาย)'
        : !validateThaiId(vendorTaxId)
          ? 'เลขไม่ถูกต้อง — ตรวจสอบอีกครั้ง'
          : undefined,
  }
  const invalid = Object.values(errors).some(Boolean)

  const submit = () => {
    setTouched(true)
    if (invalid) return
    create.mutate(
      {
        vendorId,
        paymentType,
        description: description.trim(),
        grossAmount: grossNum,
        whtRate,
        transferDate,
        slipReference: slipRef,
        slipName,
        vendorTaxId,
      },
      { onSuccess: (t) => nav(`/transactions/${t.id}`) },
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">สร้างรายการใหม่</h1>
        <p className="mt-1 text-sm text-ink-500">ธนาคารเท่านั้น · หมายเลขใบเสร็จออกเมื่อผู้ขายเซ็นเท่านั้น</p>
      </div>

      <Card>
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>ผู้ขาย</Label>
              <select className={inputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                {VENDORS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>ประเภทการจ่าย</Label>
              <select className={inputCls} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                {PILOT_CONFIG.paymentTypes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>เลขบัตรประชาชนผู้ขาย</Label>
            <Input
              value={vendorTaxId}
              onChange={(e) => setVendorTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
              placeholder="13 หลัก — ใช้ล็อกหน้าผู้ขาย"
              inputMode="numeric"
            />
            {(() => {
              const digits = vendorTaxId.replace(/\D/g, '').length
              const ok = validateThaiId(vendorTaxId)
              return (
                <div className="mt-1.5 space-y-0.5 text-[13px]">
                  <p className={digits === 13 ? 'font-medium text-emerald-600' : 'text-ink-400'}>
                    {digits === 13 ? '✓' : '•'} ครบ 13 หลัก ({digits}/13)
                  </p>
                  {digits === 13 &&
                    (ok ? (
                      <p className="font-medium text-emerald-600">✓ เลขถูกต้อง — ใช้ล็อกหน้าผู้ขายได้</p>
                    ) : (
                      <p className="font-medium text-red-600">เลขไม่ถูกต้อง — ตรวจสอบทีละหลัก (มักสลับตำแหน่งกัน)</p>
                    ))}
                </div>
              )
            })()}
          </div>

          <div>
            <Label hint="เช่น ค่าจ้างทำความสะอาดสำนักงาน ก.ย.">รายละเอียด</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ระบุงาน / บริการที่จ่าย…" />
            {touched && <FieldError msg={errors.description} />}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label hint="บาท">ยอด gross</Label>
              <Input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
              {touched && <FieldError msg={errors.gross} />}
            </div>
            <div>
              <Label>WHT % (จาก config)</Label>
              <select className={inputCls} value={whtRate} onChange={(e) => setWhtRate(Number(e.target.value))}>
                {PILOT_CONFIG.whtRates.map((r) => (
                  <option key={r.label} value={r.value}>
                    {r.label}
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
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500">หัก WHT ({whtRate}%)</span>
              <span className="font-semibold tabular-nums">฿{fmtTHB(wht)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 py-1.5">
              <span className="font-bold">ยอดสุทธิที่ผู้ขายได้รับ</span>
              <span className="text-lg font-bold tabular-nums">฿{fmtTHB(net)}</span>
            </div>
            {net >= PILOT_CONFIG.stampDutyWarningThreshold && (
              <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] font-medium text-amber-800">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                ยอดเกิน ฿{fmtTHB(PILOT_CONFIG.stampDutyWarningThreshold)} — โปรดตรวจสอบอากรแสตมป์กับนักบัญชีก่อนออกเอกสาร [VERIFY]
              </p>
            )}
            {whtMismatch && <FieldError msg="อัตรา WHT ไม่อยู่ใน config มาตรฐาน — จะถูก flag ให้ reviewer" />}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="ไม่บังคับ — แนบภายหลังได้">เลขที่อ้างอิงสลิป</Label>
              <Input value={slipRef} onChange={(e) => setSlipRef(e.target.value)} placeholder="เช่น TRF-881201" />
              {touched && <FieldError msg={errors.slipRef} />}
              {slipRef && !dup && <p className="mt-1.5 text-[13px] text-emerald-600">เลขนี้ยังไม่ซ้ำ ✓</p>}
            </div>
            <div>
              <Label hint="ไม่บังคับ">สลิปโอนเงิน</Label>
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
          </div>

          {create.isError && <FieldError msg={(create.error as Error).message} />}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => nav(-1)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={create.isPending} className="sm:min-w-48">
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
