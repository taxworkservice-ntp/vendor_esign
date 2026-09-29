import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Eraser, Lock, ReceiptText, ShieldAlert } from 'lucide-react'
import { GATE_MAX_TRIES, gateRemaining, isGateUnlocked, tryGateUnlock, useVendorActions, useVendorTxn } from '../hooks/useVendor'
import { maskTaxId } from '../lib/taxid'
import { loadSettings } from '../lib/settings'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import SigPad, { SigPadHandle } from '../components/ui/sigpad'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-control bg-ink-900 text-white">
            <ReceiptText size={18} />
          </span>
          <div className="leading-tight">
            <p className="text-body font-semibold">ใบเสร็จรับเงิน — ยืนยันรับเงิน</p>
            <p className="text-label text-ink-500">Taxwork pilot · ไม่ต้องสมัครสมาชิก</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function StateCard({ title, body, extra }: { title: string; body: string; extra?: React.ReactNode }) {
  return (
    <Shell>
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-lg font-semibold">{title}</p>
          <p className="mx-auto mt-2 max-w-sm text-body text-ink-500">{body}</p>
          {extra}
        </CardBody>
      </Card>
    </Shell>
  )
}

export function VendorSign() {
  const { token } = useParams()
  const { data: t, isLoading } = useVendorTxn(token)
  const acts = useVendorActions()
  const padRef = useRef<SigPadHandle>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [tid, setTid] = useState('')
  const [consent, setConsent] = useState(false)
  const [drew, setDrew] = useState(false)
  const [done, setDone] = useState(false)
  const [tried, setTried] = useState(false)

  // Tax ID gate: wrong-recipient guard. Legacy rows without a stored hash
  // skip the gate with a notice.
  const [gateId, setGateId] = useState('')
  const [gateBusy, setGateBusy] = useState(false)
  const [gateErr, setGateErr] = useState('')
  const [remaining, setRemaining] = useState(GATE_MAX_TRIES)
  const [unlocked, setUnlocked] = useState(false)
  const [gatePassed, setGatePassed] = useState(false)

  useEffect(() => {
    if (token) {
      setUnlocked(isGateUnlocked(token))
      setRemaining(gateRemaining(token))
    }
  }, [token, t?.id])

  useEffect(() => {
    if (t?.id && t.status === 'sent') acts.markOpened(t.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.status])

  if (isLoading) return <StateCard title="กำลังโหลด…" body="กรุณารอสักครู่" />
  if (!t)
    return (
      <StateCard
        title="ลิงก์ไม่ถูกต้องหรือหมดอายุ"
        body={`ลิงก์นี้อาจหมดอายุ (เกิน ${loadSettings().linkExpiryDays} วัน) ถูกเพิกถอน หรือถูกใช้ไปแล้ว กรุณาติดต่อผู้จ่ายเงินเพื่อขอลิงก์ใหม่`}
      />
    )
  if (t.status === 'cancelled')
    return <StateCard title="ลิงก์ถูกเพิกถอนแล้ว" body="ผู้จ่ายเงินยกเลิกลิงก์นี้ กรุณาติดต่อผู้จ่ายเงินเพื่อขอลิงก์ใหม่" />
  if (t.status === 'void')
    return <StateCard title="เอกสารนี้ถูกยกเลิก (void)" body="ไม่ต้องดำเนินการใด ๆ กรุณาติดต่อผู้จ่ายเงินหากมีข้อสงสัย" />
  if (t.status === 'signed' || t.status === 'issued' || done)
    return (
      <StateCard
        title="บันทึกเรียบร้อย ✓"
        body="ขอบคุณ — ระบบบันทึกการรับเงินและการมอบอำนาจออกใบเสร็จเฉพาะธุรกรรมนี้แล้ว"
        extra={
          <div className="mt-5">
            <Link to={`/receipts/${t.id}`}>
              <Button>ดูสำเนาใบเสร็จ</Button>
            </Link>
          </div>
        }
      />
    )

  // Length-only for now — checksum policy comes later.
  const idOk = tid.replace(/\D/g, '').length === 13
  const emptyPad = !drew || padRef.current?.isEmpty()
  const valid = name.trim().length >= 2 && address.trim().length >= 6 && idOk && consent && !emptyPad

  const needsGate = !!t.taxIdHash && !unlocked

  const unlock = async () => {
    if (!token || gateBusy) return
    setGateBusy(true)
    setGateErr('')
    const res = await tryGateUnlock(token, t, gateId)
    setRemaining(res.remaining)
    setGateBusy(false)
    if (res.ok) {
      setUnlocked(true)
      setGatePassed(!!t.taxIdHash)
      setTid(gateId) // reuse verified ID for the signing snapshot
      // Prefill from client records — vendor confirms instead of retyping.
      setName(t.vendor.name)
      setAddress(t.vendor.address)
      setGateId('')
      window.scrollTo(0, 0)
    } else {
      setGateErr(
        res.remaining <= 0
          ? 'ลองเกินกำหนด — ลิงก์นี้ถูกล็อกชั่วคราว กรุณาติดต่อผู้จ่ายเงิน'
          : `เลขไม่ตรงกับที่ผู้จ่ายระบุ (เหลือ ${res.remaining} ครั้ง) — หากไม่ใช่ท่าน กรุณาอย่าดำเนินการต่อ`,
      )
    }
  }

  if (needsGate)
    return (
      <Shell>
        <Card>
          <CardBody className="space-y-4">
            <p className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-ink-900 text-white">
              <Lock size={22} />
            </p>
            <div className="text-center">
              <h2 className="text-lg font-semibold">ยืนยันตัวตนก่อนเปิดเอกสาร</h2>
              <p className="mx-auto mt-1 max-w-sm text-body text-ink-500">
                ลิงก์นี้ส่งถึงผู้รับเงินโดยเฉพาะ — กรอกเลขบัตรประชาชน 13 หลัก
                {t.taxIdLast4 ? ` (ลงท้าย ${t.taxIdLast4}) ` : ' '}
                เพื่อเปิดแบบฟอร์ม
              </p>
            </div>
            <div>
              <Label hint={`${gateId.length}/13 หลัก`}>เลขบัตรประชาชนของท่าน</Label>
              <Input
                value={gateId}
                onChange={(e) => setGateId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                placeholder="กรอก 13 หลักเพื่อยืนยันว่าเป็นท่าน"
                inputMode="numeric"
              />
              {gateErr && <FieldError msg={gateErr} />}
            </div>
            <Button className="w-full py-3.5 text-base" disabled={gateId.length !== 13 || gateBusy || remaining <= 0} onClick={unlock}>
              {gateBusy ? 'กำลังตรวจสอบ…' : 'เปิดเอกสาร'}
            </Button>
            <p className="text-center text-label text-ink-400">พิมพ์ผิดได้ไม่เกิน {GATE_MAX_TRIES} ครั้ง · ระบบไม่แสดงข้อมูลใด ๆ จนกว่าจะยืนยันสำเร็จ</p>
          </CardBody>
        </Card>
      </Shell>
    )

  const submit = () => {
    setTried(true)
    if (!valid || !padRef.current) return
    acts.submit(t.id, {
      vendorName: name.trim(),
      vendorAddress: address.trim(),
      vendorIdLast4: tid.replace(/\D/g, '').slice(-4),
      signaturePng: padRef.current.toPng(),
      verificationMethod: 'stub-deferred',
      consentVersion: 'v1',
      signedAt: new Date().toISOString(),
      corrections: [], // computed at submit (diff vs client records)
    })
    setDone(true)
    window.scrollTo(0, 0)
  }

  return (
    <Shell>
      <div className="space-y-4">
        {!t.taxIdHash ? (
          <p className="flex gap-2 rounded-control bg-amber-50 p-3 text-body font-medium text-amber-800">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            รายการก่อนหน้า: ลิงก์นี้ไม่ได้ตั้งการล็อกด้วยเลขบัตรประชาชน — โปรดตรวจสอบให้แน่ใจก่อนลงนาม
          </p>
        ) : (
          <p className="flex gap-2 rounded-control bg-emerald-50 p-3 text-body font-medium text-emerald-800">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ยืนยันตัวตนแล้ว {t.taxIdLast4 ? `(${maskTaxId(t.taxIdLast4)})` : ''} — ลิงก์นี้เปิดได้เฉพาะท่าน
          </p>
        )}
        <Card className="border-emerald-200">
          <CardBody>
            <p className="flex items-center gap-1.5 text-body font-semibold text-ink-500">
              <Lock size={13} /> ข้อมูลจากผู้จ่าย — ล็อกไว้ แก้ไขไม่ได้
            </p>
            {t.note && <p className="mt-2 text-body font-semibold text-ink-500">{t.note}</p>}
            <div className="mt-2 divide-y divide-ink-100">
              {(t.lineItems?.some((it) => it.description || it.amount)
                ? t.lineItems
                : [{ description: t.description, amount: t.grossAmount }]
              ).map((it, i) => {
                const qty = it.quantity ?? 1
                const unitPrice = it.unitPrice ?? it.amount
                const detail = `${qty}${it.unit ? ` ${it.unit}` : ''} × ฿${fmtTHB(unitPrice)}${it.discount ? ` − ส่วนลด ฿${fmtTHB(it.discount)}` : ''}`
                return (
                  <div key={i} className="flex items-baseline gap-3 py-1.5 text-body">
                    <span className="w-5 shrink-0 text-right font-mono text-label text-ink-400">{i + 1}</span>
                    <span className="flex-1">
                      {it.description}
                      <span className="mt-0.5 block text-label text-ink-400">{detail}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">฿{fmtTHB(it.amount)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 space-y-1 border-t border-card-border pt-3 text-body">
              <p className="flex justify-between"><span className="text-ink-500">ยอดรับสุทธิ</span><span className="font-semibold tabular-nums">฿{fmtTHB(t.netAmount)}</span></p>
              <p className="text-body text-ink-500">({amountToThaiWords(t.netAmount)})</p>
              <p className="flex justify-between"><span className="text-ink-500">หัก WHT {t.whtRate}%</span><span className="tabular-nums">฿{fmtTHB(t.whtAmount)}</span></p>
              <p className="flex justify-between"><span className="text-ink-500">วันที่โอน</span><span>{fmtDateTH(t.transferDate)}</span></p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-semibold">1 · {gatePassed ? 'ตรวจข้อมูลของท่าน' : 'ข้อมูลของท่าน'}</h2>
            {gatePassed && (
              <p className="text-body text-ink-500">กรอกจากประวัติที่ผู้จ่ายบันทึกไว้ — ตรวจว่าตรงกับบัตรของท่าน แก้ไขได้หากไม่ตรง</p>
            )}
            <div>
              <Label>ชื่อ–นามสกุล (ตามบัตรประชาชน)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
              {tried && name.trim().length < 2 && <FieldError msg="กรุณากรอกชื่อ" />}
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด" />
              {tried && address.trim().length < 6 && <FieldError msg="กรุณากรอกที่อยู่ให้ครบ" />}
            </div>
            {gatePassed && t.taxIdLast4 ? (
              <div className="rounded-control bg-emerald-50 p-3.5 text-body">
                <Label>เลขบัตรประชาชน</Label>
                <p className="font-mono font-semibold">{maskTaxId(t.taxIdLast4)} <span className="font-sans text-body font-medium text-emerald-700">✓ ยืนยันแล้ว ไม่ต้องกรอกซ้ำ</span></p>
              </div>
            ) : (
              <div>
                <Label hint={`${tid.length}/13 หลัก — เก็บเฉพาะตัวเลข`}>เลขบัตรประชาชน</Label>
                <Input value={tid} onChange={(e) => setTid(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="x-xxxx-xxxxx-xx-x" inputMode="numeric" />
                {tried && !idOk && <FieldError msg="กรุณากรอกให้ครบ 13 หลัก" />}
                {idOk && <p className="mt-1.5 flex items-center gap-1 text-body font-medium text-emerald-600"><CheckCircle2 size={14} /> ครบ 13 หลัก</p>}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">2 · เซ็นชื่อรับเงิน</h2>
              <button
                className="inline-flex items-center gap-1 rounded-control bg-ink-100 px-3 py-2 text-body font-semibold"
                onClick={() => { padRef.current?.clear(); setDrew(false) }}
              >
                <Eraser size={14} /> ล้าง
              </button>
            </div>
            <div className="rounded-control border-2 border-dashed border-ink-300 p-1">
              <SigPad ref={padRef} onDraw={() => setDrew(true)} />
            </div>
            <p className="text-body text-ink-500">ใช้นิ้วหรือเมาส์เซ็นในกรอบ — ลายเซ็นนี้ยืนยันว่าได้รับเงินและมอบอำนาจเฉพาะธุรกรรมนี้</p>
            {tried && emptyPad && <FieldError msg="กรุณาเซ็นชื่อก่อนส่ง" />}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold">3 · ยืนยันและส่ง</h2>
            <p className="flex gap-2 rounded-control bg-amber-50 p-3 text-body font-medium text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              การยืนยันตัวตนผ่าน LINE จะเปิดใช้งานภายหลัง — ขณะนี้ยืนยันด้วยการให้ความยินยอมและลายเซ็น
            </p>
            <label className="flex gap-3 rounded-control bg-ink-50 p-4 text-body leading-relaxed active:bg-ink-100">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-slate-900" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ <b>{loadSettings(t.tenantId).clientCode}</b> ออกใบเสร็จรับเงิน
               ในนามของข้าพเจ้า <b>เฉพาะธุรกรรมนี้เท่านั้น</b>
              </span>
            </label>
            {tried && !consent && <FieldError msg="กรุณายืนยันความยินยอมก่อนส่ง" />}
            <Button className="w-full py-3.5 text-base" onClick={submit}>
              เซ็นรับเงินและส่ง
            </Button>
            <p className="text-label leading-relaxed text-ink-400">
              ข้อมูลที่เก็บ: ชื่อ ที่อยู่ เลขบัตรประชาชน (เข้ารหัส) ลายเซ็น และเวลายืนยัน — ใช้เพื่อออกใบเสร็จสำหรับธุรกรรมนี้เท่านั้น
              ผู้ที่เข้าถึงข้อมูล: ลูกค้าผู้จ่ายและนักบัญชี · ระยะเวลาจัดเก็บ: ตามนโยบายของลูกค้าผู้จ่าย
            </p>
          </CardBody>
        </Card>
      </div>
    </Shell>
  )
}
