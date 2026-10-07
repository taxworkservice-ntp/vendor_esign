import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Download, Eraser, Lock, ReceiptText, ShieldAlert } from 'lucide-react'
import { GATE_MAX_TRIES, gateRemaining, isGateUnlocked, tryGateUnlock, useVendorActions, useVendorTxn, type VendorAuth } from '../hooks/useVendor'
import { saveBlob } from '../lib/api-client'
import { receiptSheetToA4PdfBytes } from '../lib/receipt-to-a4-pdf'
import { normalizeLineItem } from '../lib/line-items'
import { renderTypedSignature, SIGNATURE_FONT, signMethodLabel } from '../lib/typed-signature'
import { cn } from '../lib/cn'
import { ReceiptSheet, type ReceiptSheetData } from '../components/receipt/receipt-sheet'
import { maskTaxId } from '../lib/taxid'
import { loadSettings } from '../lib/settings'
import { fmtTHB, fmtDateTH, fmtDateTimeTHLong } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import SigPad, { SigPadHandle } from '../components/ui/sigpad'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-control bg-primary text-white">
            <ReceiptText size={18} />
          </span>
          <div className="leading-tight">
            <p className="text-body font-semibold">ใบเสร็จรับเงิน — ยืนยันรับเงิน</p>
            <p className="text-label text-ink-500">ระบบออกใบเสร็จรับเงิน · ไม่ต้องสมัครสมาชิก</p>
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

  const [prefix, setPrefix] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [authRef, setAuthRef] = useState('')
  // The issued receipt returned by the sign call (number + verification code).
  const [receipt, setReceipt] = useState<{ number: string; verificationCode: string } | null>(null)
  // Snapshot of the receipt sheet data, captured at signing — the invite token is
  // consumed, so the vendor cannot refetch the transaction to build it later.
  const [vendorData, setVendorData] = useState<ReceiptSheetData | null>(null)
  const [downloading, setDownloading] = useState(false)
  const vendorSheetRef = useRef<HTMLDivElement>(null)
  const [tid, setTid] = useState('')
  const [consent, setConsent] = useState(false)
  const [drew, setDrew] = useState(false)
  // 'draw' = canvas signature; 'type' = typed-name e-signature (fallback).
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [done, setDone] = useState(false)
  const [signedId, setSignedId] = useState<string>()
  const [tried, setTried] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Tax ID gate: wrong-recipient guard. Legacy rows without a stored hash
  // skip the gate with a notice.
  const [gateId, setGateId] = useState('')
  const [gateBusy, setGateBusy] = useState(false)
  const [gateErr, setGateErr] = useState('')
  const [remaining, setRemaining] = useState(GATE_MAX_TRIES)
  const [unlocked, setUnlocked] = useState(false)
  const [gatePassed, setGatePassed] = useState(false)

  useEffect(() => {
    if (!token) return
    setRemaining(gateRemaining(token))
    const alreadyUnlocked = isGateUnlocked(token)
    setUnlocked(alreadyUnlocked)
    // Re-open on the same device: the gate was already passed, so restore the
    // confirmed/prefilled state (the link stays valid until signing).
    if (alreadyUnlocked && t?.id) {
      setGatePassed(!!t.taxIdHash)
      setPrefix(t.vendor.prefix ?? '')
      setName(t.vendor.name)
      setAddress(t.vendor.address)
      setPhone(t.vendor.phone ?? '')
      setEmail(t.vendor.email ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t?.id])

  useEffect(() => {
    if (t?.id && t.status === 'sent') acts.markOpened(t.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.status])

  const downloadReceipt = async () => {
    const el = vendorSheetRef.current
    if (!el || !vendorData) return
    setDownloading(true)
    try {
      const bytes = await receiptSheetToA4PdfBytes(el)
      saveBlob(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), `${vendorData.number}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) return <StateCard title="กำลังโหลด…" body="โปรดรอสักครู่" />
  if (t?.status === 'cancelled')
    return <StateCard title="ลิงก์ถูกเพิกถอนแล้ว" body="ลูกค้าผู้จ่ายได้เพิกถอนลิงก์นี้ โปรดติดต่อลูกค้าผู้จ่ายเพื่อขอลิงก์ใหม่" />
  if (t?.status === 'void')
    return <StateCard title="เอกสารนี้ถูกยกเลิกแล้ว" body="ไม่จำเป็นต้องดำเนินการใด ๆ โปรดติดต่อลูกค้าผู้จ่ายหากมีข้อสงสัย" />
  // The invite token is consumed on signing, so the lookup can return empty
  // afterwards — keep a snapshot id so the success state still renders.
  if (done || t?.status === 'signed' || t?.status === 'issued') {
    const receiptId = t?.id ?? signedId
    const number = receipt?.number ?? t?.receiptNumber
    return (
      <>
      <StateCard
        title="ยืนยันการลงนามเรียบร้อยแล้ว"
        body="ระบบได้บันทึกการลงนามอิเล็กทรอนิกส์ของท่านเพื่อยืนยันการรับเงินและมอบอำนาจให้ลูกค้าออกใบเสร็จในนามของท่านสำหรับธุรกรรมนี้ และได้ออกใบเสร็จรับเงินเรียบร้อยแล้ว"
        extra={
          <div className="mt-5 space-y-3">
            {number && (
              <p className="text-body text-ink-500">
                เลขที่ใบเสร็จ: <span className="font-mono font-semibold text-ink-900">{number}</span>
              </p>
            )}
            {receipt?.verificationCode && (
              <p className="text-body text-ink-500">
                รหัสตรวจสอบ: <span className="font-mono font-semibold text-ink-900">{receipt.verificationCode}</span>
              </p>
            )}
            {authRef && (
              <p className="text-body text-ink-500">
                เลขอ้างอิงการลงนาม: <span className="font-mono font-semibold text-ink-900">{authRef}</span>
              </p>
            )}
            {vendorData?.signedAt && (
              <p className="text-body text-ink-500">
                ลงนามเมื่อ: <span className="font-semibold text-ink-900">{fmtDateTimeTHLong(vendorData.signedAt)}</span>
              </p>
            )}
            {vendorData?.sigMethod && (
              <p className="text-body text-ink-500">
                วิธีการลงนาม: <span className="font-semibold text-ink-900">{signMethodLabel(vendorData.sigMethod)}</span>
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {vendorData && (
                <Button onClick={downloadReceipt} loading={downloading}>
                  <Download size={15} aria-hidden /> {downloading ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดใบเสร็จ (PDF)'}
                </Button>
              )}
              {receiptId && (
                <Link to={`/v/receipt/${receiptId}`}>
                  <Button variant="secondary">ดูสำเนาใบเสร็จ</Button>
                </Link>
              )}
            </div>
            <p className="mx-auto max-w-sm text-label leading-relaxed text-ink-400">
              ลายมือชื่ออิเล็กทรอนิกส์ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 · ข้อตกลง v1
            </p>
            <p className="mx-auto max-w-sm text-label leading-relaxed text-ink-400">
              ลิงก์นี้ใช้ได้ครั้งเดียวและถูกปิดแล้ว หากท่านไม่ได้เป็นผู้ลงนาม โปรดติดต่อลูกค้าผู้จ่ายทันที
            </p>
          </div>
        }
      />
      {/* Hidden copy of the receipt, rasterised by the download button. */}
      {vendorData && (
        <div aria-hidden style={{ position: 'absolute', left: '-10000px', top: 0, width: '210mm' }}>
          <ReceiptSheet ref={vendorSheetRef} data={vendorData} />
        </div>
      )}
      </>
    )
  }
  if (!t)
    return (
      <StateCard
        title="ลิงก์ไม่ถูกต้องหรือหมดอายุ"
        body={`ลิงก์นี้อาจหมดอายุ (เกิน ${loadSettings().linkExpiryDays} วัน) ถูกเพิกถอน หรือถูกใช้ไปแล้ว โปรดติดต่อลูกค้าผู้จ่ายเพื่อขอลิงก์ใหม่`}
      />
    )

  // Length-only for now — checksum policy comes later. Once the gate is passed
  // on this device the ID is already proven, so it need not be retyped.
  const idOk = tid.replace(/\D/g, '').length === 13 || (gatePassed && !!t.taxIdLast4)
  const drawnEmpty = !drew || padRef.current?.isEmpty()
  const typedEmpty = signMode === 'type' && typedName.trim().length < 2
  const signatureOk = signMode === 'type' ? !typedEmpty : !drawnEmpty
  const prefixOk = !prefixRequired(name) || isVendorPrefix(prefix)
  const valid = name.trim().length >= 2 && prefixOk && address.trim().length >= 6 && idOk && consent && signatureOk

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
      setPrefix(t.vendor.prefix ?? '')
      setName(t.vendor.name)
      setAddress(t.vendor.address)
      setPhone(t.vendor.phone ?? '')
      setEmail(t.vendor.email ?? '')
      setGateId('')
      window.scrollTo(0, 0)
    } else {
      setGateErr(
        res.remaining <= 0
          ? 'พยายามเกินกำหนด — ลิงก์นี้ถูกล็อกชั่วคราว โปรดติดต่อลูกค้าผู้จ่าย'
          : `เลขไม่ตรงกับที่ลูกค้าผู้จ่ายระบุ (เหลือ ${res.remaining} ครั้ง) — โปรดอย่าดำเนินการต่อหากไม่ใช่ท่าน`,
      )
    }
  }

  if (needsGate)
    return (
      <Shell>
        <Card>
          <CardBody className="space-y-4">
            <p className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-primary text-white">
              <Lock size={22} />
            </p>
            <div className="text-center">
              <h2 className="text-lg font-semibold">ยืนยันตัวตนก่อนเปิดเอกสาร</h2>
              <p className="mx-auto mt-1 max-w-sm text-body text-ink-500">
                ลิงก์นี้จัดส่งถึงผู้รับเงินโดยเฉพาะ — โปรดกรอกเลขบัตรประชาชน 13 หลัก
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
            <Button className="w-full py-3.5 text-base" loading={gateBusy} disabled={gateId.length !== 13 || remaining <= 0} onClick={unlock}>
              {gateBusy ? 'กำลังตรวจสอบ…' : 'เปิดเอกสาร'}
            </Button>
            <p className="text-center text-label text-ink-400">พิมพ์ผิดได้ไม่เกิน {GATE_MAX_TRIES} ครั้ง · ระบบไม่แสดงข้อมูลใด ๆ จนกว่าจะยืนยันสำเร็จ</p>
          </CardBody>
        </Card>
      </Shell>
    )

  // Validate, then ask for an explicit confirmation before the irreversible
  // signing call. An e-signature is a legal act, so it should never fire on a
  // stray tap.
  const submit = () => {
    setTried(true)
    setSubmitErr('')
    if (!valid) return
    if (signMode === 'draw' && !padRef.current) return
    setConfirmOpen(true)
  }

  const doSubmit = async () => {
    setConfirmOpen(false)
    if (signMode === 'draw' && !padRef.current) return
    setSubmitting(true)
    try {
      const signaturePng = signMode === 'type' ? await renderTypedSignature(typedName) : padRef.current!.toPng()
      const auth: VendorAuth = {
        vendorPrefix: isVendorPrefix(prefix) ? prefix : '',
        vendorName: name.trim(),
        vendorAddress: address.trim(),
        vendorPhone: phone.trim(),
        vendorEmail: email.trim(),
        vendorIdLast4: tid.replace(/\D/g, '').slice(-4) || (t.taxIdLast4 ?? ''),
        signaturePng,
        verificationMethod: signMode === 'type' ? 'typed-consent' : 'stub-deferred',
        consentVersion: 'v1',
        signedAt: new Date().toISOString(),
        corrections: [], // computed at submit (diff vs client records)
      }
      const res = await acts.submit(t.id, auth, token)
      if (!res.ok) {
        setSubmitErr(
          res.error === 'not-unlocked'
            ? 'ยังไม่ได้ยืนยันตัวตน — โปรดยืนยันเลขบัตรประชาชนก่อนลงนาม'
            : res.error === 'already-signed'
              ? 'ลิงก์นี้ถูกลงนามไปแล้ว'
              : 'ส่งข้อมูลไม่สำเร็จ โปรดลองอีกครั้งหรือติดต่อลูกค้าผู้จ่าย',
        )
        return
      }
      if (res.authRef) setAuthRef(res.authRef)
      const number = res.number ?? t.receiptNumber ?? 'ยังไม่ออกเลข'
      if (res.number) setReceipt({ number: res.number, verificationCode: res.verificationCode ?? '' })
      // Snapshot the sheet now: the invite token is consumed, so the transaction
      // cannot be fetched again to render the receipt later.
      setVendorData({
        number,
        transferDate: t.transferDate,
        issueDate: new Date().toISOString().slice(0, 10),
        items: (t.lineItems.some((it) => it.description || it.amount)
          ? t.lineItems
          : [{ description: t.description, amount: t.grossAmount }]
        ).map(normalizeLineItem),
        grossAmount: t.grossAmount,
        whtRate: t.whtRate,
        whtAmount: t.whtAmount,
        netAmount: t.netAmount,
        note: t.note,
        client: res.client ?? { displayName: t.clientCode ?? '', address: '', taxId: '' },
        vendor: {
          prefix: auth.vendorPrefix,
          name: auth.vendorName,
          address: auth.vendorAddress,
          phone: auth.vendorPhone || undefined,
          email: auth.vendorEmail || undefined,
          maskedId: t.vendor.maskedId,
        },
        sig: { kind: 'ready', png: auth.signaturePng },
        signedAt: auth.signedAt,
        sigMethod: auth.verificationMethod,
        verificationCode: res.verificationCode ?? undefined,
        verifyUrl: res.verificationCode ? `${window.location.origin}/verify/${res.verificationCode}` : undefined,
      })
      // Allow this browser to open the receipt copy right after signing (the
      // single-use invite token is consumed, so a URL flag is the only handle).
      try {
        sessionStorage.setItem(`taxwork-vendor-signed-${t.id}`, '1')
      } catch {
        /* private mode */
      }
      setSignedId(t.id)
      setDone(true)
      window.scrollTo(0, 0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell>
      <div className="space-y-4">
        {!t.taxIdHash ? (
          <p className="flex gap-2 rounded-control bg-warning-soft p-3 text-body font-medium text-warning">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            รายการก่อนหน้า: ลิงก์นี้ไม่ได้ตั้งการล็อกด้วยเลขบัตรประชาชน — โปรดตรวจสอบให้แน่ใจก่อนลงนาม
          </p>
        ) : (
          <p className="flex gap-2 rounded-control bg-success-soft p-3 text-body font-medium text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ยืนยันตัวตนแล้ว {t.taxIdLast4 ? `(${maskTaxId(t.taxIdLast4)})` : ''} — ลิงก์นี้เปิดได้เฉพาะท่าน
          </p>
        )}
        <Card className="border-success/30">
          <CardBody>
            <p className="flex items-center gap-1.5 text-body font-medium text-ink-500">
              <Lock size={13} /> ข้อมูลจากลูกค้าผู้จ่าย — ระบบล็อกไว้ ไม่สามารถแก้ไขได้
            </p>
            {t.note && <p className="mt-2 text-body font-medium text-ink-500">{t.note}</p>}
            <div className="mt-2 divide-y divide-ink-100">
              {(t.lineItems?.some((it) => it.description || it.amount)
                ? t.lineItems
                : [{ description: t.description, amount: t.grossAmount }]
              ).map((it, i) => {
                const qty = it.quantity ?? 1
                const unitPrice = it.unitPrice ?? it.amount
                const detail = `${qty}${it.unit ? ` ${it.unit}` : ''} × ${fmtTHB(unitPrice)}${it.discount ? ` − ส่วนลด ${fmtTHB(it.discount)}` : ''}`
                return (
                  <div key={i} className="flex items-baseline gap-3 py-1.5 text-body">
                    <span className="w-5 shrink-0 text-right font-mono text-label text-ink-400">{i + 1}</span>
                    <span className="flex-1">
                      {it.description}
                      <span className="mt-0.5 block text-label text-ink-400">{detail}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtTHB(it.amount)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 space-y-1 border-t border-card-border pt-3 text-body">
              <p className="flex justify-between"><span className="text-ink-500">ยอดรับสุทธิ</span><span className="font-semibold tabular-nums">{fmtTHB(t.netAmount)}</span></p>
              <p className="text-body text-ink-500">({amountToThaiWords(t.netAmount)})</p>
              <p className="flex justify-between"><span className="text-ink-500">หักภาษี ณ ที่จ่าย {t.whtRate}%</span><span className="tabular-nums">{fmtTHB(t.whtAmount)}</span></p>
              <p className="flex justify-between"><span className="text-ink-500">วันที่โอน</span><span>{fmtDateTH(t.transferDate)}</span></p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-semibold">1 · {gatePassed ? 'ตรวจข้อมูลของท่าน' : 'ข้อมูลของท่าน'}</h2>
            {gatePassed && (
              <p className="text-body text-ink-500">ข้อมูลจากประวัติที่ลูกค้าผู้จ่ายบันทึกไว้ — โปรดตรวจสอบให้ตรงกับบัตรประชาชนของท่าน และแก้ไขได้หากไม่ตรง</p>
            )}
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <div>
                <Label>คำนำหน้าชื่อ</Label>
                <Select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
                  <option value="">—</option>
                  {VENDOR_PREFIXES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
                {tried && !prefixOk && <FieldError msg="กรุณาเลือกคำนำหน้าชื่อ" />}
              </div>
              <div>
                <Label>ชื่อ–นามสกุล (ตามบัตรประชาชน)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
                {tried && name.trim().length < 2 && <FieldError msg="กรุณากรอกชื่อ" />}
              </div>
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด" />
              {tried && address.trim().length < 6 && <FieldError msg="กรุณากรอกที่อยู่ให้ครบ" />}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label hint="ไม่บังคับ">โทรศัพท์</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" autoComplete="tel" />
              </div>
              <div>
                <Label hint="ไม่บังคับ">อีเมล</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
              </div>
            </div>
            {gatePassed && t.taxIdLast4 ? (
              <div className="rounded-control bg-success-soft p-3.5 text-body">
                <Label>เลขบัตรประชาชน</Label>
                <p className="font-mono font-semibold">{maskTaxId(t.taxIdLast4)} <span className="font-sans text-body font-medium text-success">ยืนยันแล้ว ไม่ต้องกรอกซ้ำ</span></p>
              </div>
            ) : (
              <div>
                <Label hint={`${tid.length}/13 หลัก — เก็บเฉพาะตัวเลข`}>เลขบัตรประชาชน</Label>
                <Input value={tid} onChange={(e) => setTid(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="x-xxxx-xxxxx-xx-x" inputMode="numeric" />
                {tried && !idOk && <FieldError msg="กรุณากรอกให้ครบ 13 หลัก" />}
                {idOk && <p className="mt-1.5 flex items-center gap-1 text-body font-medium text-success"><CheckCircle2 size={14} /> ครบ 13 หลัก</p>}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">2 · ลงนามรับเงิน</h2>
              {signMode === 'draw' && (
                <button
                  className="inline-flex items-center gap-1 rounded-control bg-ink-100 px-3 py-2 text-body font-semibold"
                  onClick={() => { padRef.current?.clear(); setDrew(false) }}
                >
                  <Eraser size={14} /> ล้าง
                </button>
              )}
            </div>

            {/* Choose how to sign. Drawing is the default; typing is the fallback
                for a vendor who cannot or will not use mouse/touch. */}
            <div className="grid grid-cols-2 gap-1.5 rounded-control bg-ink-100 p-1">
              {([['draw', 'วาดลายเซ็น'], ['type', 'พิมพ์ชื่อเพื่อลงนาม']] as const).map(([v, th]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setSignMode(v)
                    if (v === 'type' && !typedName.trim()) setTypedName(name.trim())
                  }}
                  className={cn(
                    'rounded-control px-3 py-2 text-body transition',
                    signMode === v ? 'bg-primary-soft font-semibold text-primary-text' : 'font-medium text-ink-500 hover:text-ink-900',
                  )}
                >
                  {th}
                </button>
              ))}
            </div>

            {signMode === 'draw' ? (
              <>
                <div className="rounded-control border-2 border-dashed border-ink-300 p-1">
                  <SigPad ref={padRef} onDraw={() => setDrew(true)} />
                </div>
                <p className="text-body text-ink-500">ใช้นิ้วหรือเมาส์ลงนามในช่องลงนาม — ลายเซ็นนี้ยืนยันว่าได้รับเงินและมอบอำนาจสำหรับธุรกรรมนี้เท่านั้น</p>
              </>
            ) : (
              <div className="space-y-2">
                <Label>ชื่อ–นามสกุลที่ใช้ลงนาม</Label>
                <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
                {/* Same surface as the draw pad (200px), previewing the printed
                    signature: name on the signature rule + the caption. */}
                <div className="rounded-control border-2 border-dashed border-ink-300 bg-white p-1">
                  <div className="flex h-[200px] flex-col items-center justify-center">
                    <div className="flex h-14 w-full items-end justify-center px-4">
                      {typedName.trim() ? (
                        <span className="text-title leading-none text-signature" style={{ fontFamily: SIGNATURE_FONT }}>
                          {typedName.trim()}
                        </span>
                      ) : (
                        <span className="text-label text-ink-300">ลายเซ็นของท่านจะแสดงที่นี่</span>
                      )}
                    </div>
                    <p className="w-full border-t border-ink-300 px-4 pt-2 text-center text-body font-semibold">ผู้มีอำนาจลงนาม</p>
                    <p className="w-full text-center text-label text-ink-400">{name.trim() || 'ชื่อ–นามสกุล'}</p>
                  </div>
                </div>
                <p className="text-body text-ink-500">
                  พิมพ์ชื่อ–นามสกุลเพื่อลงนาม (เหมาะเมื่อไม่สะดวกวาด) — การพิมพ์ชื่อพร้อมการยืนยันด้านล่างถือเป็นการลงนามอิเล็กทรอนิกส์
                </p>
              </div>
            )}

            {tried && !signatureOk && (
              <FieldError msg={signMode === 'type' ? 'กรุณาพิมพ์ชื่อ–นามสกุลเพื่อลงนาม' : 'กรุณาลงนามก่อนส่งข้อมูล'} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold">3 · ยืนยันและส่ง</h2>
            <p className="flex gap-2 rounded-control bg-warning-soft p-3 text-body font-medium text-warning">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              การยืนยันตัวตนผ่าน LINE จะเปิดใช้งานในภายหลัง — ในขณะนี้ใช้การให้ความยินยอมและลายเซ็นในการยืนยัน
            </p>
            <label className="flex gap-3 rounded-control bg-ink-50 p-4 text-body leading-relaxed active:bg-ink-100">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-ink-900" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ <b>{t.clientCode ?? loadSettings(t.tenantId).clientCode}</b> ออกใบเสร็จรับเงิน
               ในนามของข้าพเจ้า <b>เฉพาะธุรกรรมนี้เท่านั้น</b>
              </span>
            </label>
            {tried && !consent && <FieldError msg="กรุณายืนยันความยินยอมก่อนส่ง" />}
            {submitErr && <FieldError msg={submitErr} />}
            <Button className="w-full py-3.5 text-base" onClick={submit} loading={submitting}>
              {submitting ? 'กำลังส่งข้อมูล…' : 'ลงนามรับเงินและส่งข้อมูล'}
            </Button>
            <p className="text-label leading-relaxed text-ink-400">
              ข้อมูลที่เก็บ: ชื่อ ที่อยู่ เลขบัตรประชาชน (เข้ารหัส) ลายเซ็น และเวลายืนยัน — ใช้เพื่อออกใบเสร็จสำหรับธุรกรรมนี้เท่านั้น
              ผู้ที่เข้าถึงข้อมูล: ลูกค้าผู้จ่ายและนักบัญชี · ระยะเวลาจัดเก็บ: ตามนโยบายของลูกค้าผู้จ่าย
            </p>
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        size="sm"
        title="ยืนยันการลงนามและส่งข้อมูล"
        message={
          <>
            ท่านกำลังลงนามยืนยันการรับเงินจำนวน <b className="tabular-nums">{fmtTHB(t.netAmount)} บาท</b> และมอบอำนาจออกใบเสร็จในนามของท่าน
            <br />
            ข้อมูลที่ส่งจะถูกบันทึกเป็นหลักฐานและไม่สามารถแก้ไขได้
          </>
        }
        confirmLabel="ยืนยันและส่งข้อมูล"
        cancelLabel="กลับไปตรวจสอบ"
        busy={submitting}
        onConfirm={() => void doSubmit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Shell>
  )
}
