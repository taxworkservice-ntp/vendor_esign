import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Download, Eraser, Lock, ShieldAlert } from 'lucide-react'
import { GATE_MAX_TRIES, gateRemaining, isGateUnlocked, tryGateUnlock, useVendorActions, useVendorTxn, vendorSignatureUrl, type VendorAuth } from '../hooks/useVendor'
import { apiDownload, hasServer, saveFile } from '../lib/api-client'
import { receiptSheetToA4PdfBytes } from '../lib/receipt-to-a4-pdf'
import { normalizeLineItem } from '../lib/line-items'
import { renderTypedSignature, SIGNATURE_FONT, signMethodLabel } from '../lib/typed-signature'
import type { SignatureState } from '../lib/signature-state'
import { cn } from '../lib/cn'
import { ReceiptSheet, type ReceiptSheetData } from '../components/receipt/receipt-sheet'
import { ReceiptCopyDialog } from '../components/receipt/receipt-copy-dialog'
import { maskTaxId } from '../lib/taxid'
import { loadSettings, renderConsent, CONSENT_SUMMARY, PDPA_STATEMENT, consentVersionLabel } from '../lib/settings'
import type { PaymentTransaction } from '../lib/types'
import { fmtTHB, fmtDateTH, fmtDateTimeTHLong } from '../lib/format'
import { amountToThaiWords } from '../lib/thai-words'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { EMAIL_REQUIRED_ERROR, PHONE_REQUIRED_ERROR, isValidEmail, isValidPhone } from '../lib/vendor-contact'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { PdpaNotice } from '../components/consent/pdpa-notice'
import { ActionBar } from '../components/ui/action-bar'
import { BrandBar, BrandHeader, type Brand } from '../components/vendor/brand'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import SigPad, { SigPadHandle } from '../components/ui/sigpad'

// Render the vendor consent statement: the client's wording (from tenant
// settings, or the server-rendered template on the vendor payload) with the real
// amount/date/ref substituted. One source of truth so the text the vendor
// accepts matches the version the server records.
function consentInfoFor(t: PaymentTransaction): { text: string; summary: string; version: string; clientName: string } {
  const s = loadSettings(t.tenantId)
  const clientName = t.clientName || s.displayName || t.clientCode || s.clientCode
  const version = t.consentVersion || s.consentVersion
  const vars = {
    client: clientName,
    amount: fmtTHB(t.netAmount),
    date: fmtDateTH(t.transferDate),
    ref: t.ref ?? t.id,
    version,
  }
  return {
    text: renderConsent(t.consentTemplate || s.consentTextV1, vars),
    summary: renderConsent(CONSENT_SUMMARY, vars),
    version,
    clientName,
  }
}

// The full statement as a styled intro + numbered list (instead of a wall of
// "(1)…(5)" text), shown inside an expandable disclosure.
function ConsentBody({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const intro = lines.filter((l) => !/^\(\d+\)/.test(l))
  const items = lines.filter((l) => /^\(\d+\)/.test(l)).map((l) => l.replace(/^\(\d+\)\s*/, ''))
  return (
    <div className="space-y-2 text-label leading-relaxed text-ink-600">
      {intro.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      <ol className="list-decimal space-y-1 pl-5">
        {items.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </div>
  )
}

// Build the receipt-sheet data the vendor sees. Used for the just-signed
// snapshot AND for a return visit (rebuilt from the signed payload + the
// token-gated signature), so both render the identical on-screen sheet.
function buildVendorReceiptData(
  t: PaymentTransaction,
  info: {
    number: string
    client: { displayName: string; address: string; taxId: string }
    vendor: {
      prefix?: string
      name: string
      address: string
      phone?: string | null
      email?: string | null
      taxId?: string | null
      maskedId: string
    }
    signedAt?: string | null
    sigMethod?: string | null
    authRef?: string | null
    consentVersion?: string | null
    verificationCode?: string | null
    issueDate?: string | null
    isVoid?: boolean
    voidReason?: string | null
  },
  sig: SignatureState,
): ReceiptSheetData {
  return {
    number: info.number,
    transferDate: t.transferDate,
    issueDate: info.issueDate ?? new Date().toISOString().slice(0, 10),
    items: (t.lineItems.some((it) => it.description || it.amount)
      ? t.lineItems
      : [{ description: t.description, amount: t.grossAmount }]
    ).map(normalizeLineItem),
    grossAmount: t.grossAmount,
    whtRate: t.whtRate,
    whtAmount: t.whtAmount,
    netAmount: t.netAmount,
    note: t.note,
    isVoid: info.isVoid,
    voidReason: info.voidReason ?? undefined,
    client: info.client,
    vendor: {
      prefix: info.vendor.prefix,
      name: info.vendor.name,
      address: info.vendor.address,
      phone: info.vendor.phone || undefined,
      email: info.vendor.email || undefined,
      taxId: info.vendor.taxId || undefined,
      maskedId: info.vendor.maskedId,
    },
    sig,
    signedAt: info.signedAt ?? undefined,
    sigMethod: info.sigMethod ?? undefined,
    authRef: info.authRef ?? undefined,
    consentVersion: info.consentVersion ?? undefined,
    verificationCode: info.verificationCode ?? undefined,
    verifyUrl: info.verificationCode ? `${window.location.origin}/verify/${info.verificationCode}` : undefined,
  }
}

function Shell({ children, brand }: { children: React.ReactNode; brand?: Brand }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <BrandBar />
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-4 sm:py-6">
        <BrandHeader
          brand={brand}
          title="ใบเสร็จรับเงิน — ยืนยันรับเงิน"
          subtitle="ระบบออกใบเสร็จรับเงิน · ไม่ต้องสมัครสมาชิก"
        />
        {children}
      </div>
    </div>
  )
}

function StateCard({ title, body, extra, brand }: { title: string; body: string; extra?: React.ReactNode; brand?: Brand }) {
  return (
    <Shell brand={brand}>
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
  const { data: t, isLoading, refetch } = useVendorTxn(token)
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
  // Guards the one-shot rebuild of the sheet on a return visit.
  const receiptBuiltRef = useRef(false)
  const [tid, setTid] = useState('')
  const [consent, setConsent] = useState(false)
  const [drew, setDrew] = useState(false)
  // 'draw' = canvas signature; 'type' = typed-name e-signature (fallback).
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [done, setDone] = useState(false)
  const [tried, setTried] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const brand: Brand = { clientName: t?.clientName, logoUrl: t?.logoUrl }

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

  // Return visit: the just-signed snapshot is gone (token consumed, page
  // reloaded). Rebuild the SAME receipt sheet from the signed payload + the
  // token-gated signature, so download and copy look identical to the client's
  // — never the pdf-lib artifact. If the signature can't be loaded, leave it
  // null so both fall back to the archived PDF.
  useEffect(() => {
    const txn = t
    const info = txn?.vendorReceipt
    if (!txn || !info || !token || !hasServer || vendorData || receiptBuiltRef.current) return
    receiptBuiltRef.current = true
    let cancelled = false
    void (async () => {
      if (!info.hasSignature) return
      let png: string | undefined
      try {
        const r = await fetch(vendorSignatureUrl(token), { credentials: 'include' })
        if (r.ok) png = URL.createObjectURL(await r.blob())
      } catch {
        /* fall back to the archived PDF */
      }
      if (cancelled || !png) return
      setVendorData(
        buildVendorReceiptData(
          txn,
          {
            number: info.number || txn.receiptNumber || 'ยังไม่ออกเลข',
            client: info.client,
            vendor: info.vendor,
            signedAt: info.signedAt,
            sigMethod: info.sigMethod,
            authRef: info.authRef,
            consentVersion: info.consentVersion,
            verificationCode: info.verificationCode,
            issueDate: info.issueDate,
            isVoid: info.isVoid,
            voidReason: info.voidReason,
          },
          { kind: 'ready', png },
        ),
      )
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, token, vendorData])

  const downloadReceipt = async () => {
    // Just signed on this device: rasterise the on-screen sheet so the PDF is
    // identical to the preview. Returning on the same link later: the archived
    // server PDF (the client-side sheet no longer exists on a fresh load).
    const el = vendorSheetRef.current
    setSubmitErr('')
    if (el && vendorData) {
      setDownloading(true)
      try {
        const bytes = await receiptSheetToA4PdfBytes(el)
        await saveFile(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), `${vendorData.number}.pdf`)
      } finally {
        setDownloading(false)
      }
      return
    }
    if (!token || !hasServer) return
    setDownloading(true)
    try {
      const { blob, filename } = await apiDownload(`/api/vendor/${encodeURIComponent(token)}/receipt.pdf`)
      await saveFile(blob, filename || `${receipt?.number ?? t?.receiptNumber ?? 'receipt'}.pdf`)
    } catch {
      setSubmitErr('ดาวน์โหลดใบเสร็จไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) return <StateCard title="กำลังโหลด…" body="โปรดรอสักครู่" brand={brand} />
  if (t?.status === 'cancelled')
    return <StateCard title="ลิงก์ถูกเพิกถอนแล้ว" body="ลูกค้าผู้จ่ายได้เพิกถอนลิงก์นี้ โปรดติดต่อลูกค้าผู้จ่ายเพื่อขอลิงก์ใหม่" brand={brand} />
  if (t?.status === 'void')
    return <StateCard title="เอกสารนี้ถูกยกเลิกแล้ว" body="ไม่จำเป็นต้องดำเนินการใด ๆ โปรดติดต่อลูกค้าผู้จ่ายหากมีข้อสงสัย" brand={brand} />
  // The invite token stays valid until its expiry even after signing, so the
  // lookup can return the receipt state on a return visit — keep a snapshot id
  // so the success state still renders if the lookup lags.
  if (done || t?.status === 'signed' || t?.status === 'issued') {
    const number = receipt?.number ?? vendorData?.number ?? t?.receiptNumber
    const verificationCode = receipt?.verificationCode ?? vendorData?.verificationCode ?? t?.verificationCode
    const shownAuthRef = authRef || vendorData?.authRef
    const successClient = vendorData?.client?.displayName || t?.clientName || 'ลูกค้าผู้จ่าย'
    const copyPdfPath = token && hasServer ? `/api/vendor/${encodeURIComponent(token)}/receipt.pdf` : undefined
    const consentLabel = consentVersionLabel(vendorData?.consentVersion ?? t?.consentVersion)
    return (
      <>
      <StateCard
        title="ยืนยันการลงนามเรียบร้อยแล้ว"
        body={`ระบบได้บันทึกการลงนามอิเล็กทรอนิกส์ของท่านเพื่อยืนยันการรับเงินและมอบอำนาจให้ ${successClient} ออกใบเสร็จรับเงินในนามของท่านสำหรับธุรกรรมนี้ และได้ออกใบเสร็จรับเงินเรียบร้อยแล้ว`}
        brand={brand}
        extra={
          <div className="mt-5 space-y-3">
            {number && (
              <p className="text-body text-ink-500">
                เลขที่ใบเสร็จ: <span className="font-mono font-semibold text-ink-900">{number}</span>
              </p>
            )}
            {verificationCode && (
              <p className="text-body text-ink-500">
                รหัสตรวจสอบ: <span className="font-mono font-semibold text-ink-900">{verificationCode}</span>
              </p>
            )}
            {shownAuthRef && (
              <p className="text-body text-ink-500">
                เลขอ้างอิงการลงนาม: <span className="font-mono font-semibold text-ink-900">{shownAuthRef}</span>
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
              {(vendorData || (hasServer && (receipt?.number || t?.receiptNumber))) && (
                <Button onClick={downloadReceipt} loading={downloading}>
                  <Download size={15} aria-hidden /> {downloading ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดใบเสร็จ (PDF)'}
                </Button>
              )}
              {(vendorData || copyPdfPath) && (
                <Button variant="secondary" onClick={() => setCopyOpen(true)}>ดูสำเนาใบเสร็จ</Button>
              )}
            </div>
            {submitErr && <FieldError msg={submitErr} />}
            <p className="mx-auto max-w-sm text-label leading-relaxed text-ink-400">
              ลายมือชื่ออิเล็กทรอนิกส์ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
              {consentLabel ? ` · ข้อตกลง ${consentLabel}` : ''}
            </p>
            <p className="mx-auto max-w-sm text-label leading-relaxed text-ink-400">
              เก็บลิงก์นี้ไว้ใช้อ้างอิง — ท่านกลับมาดาวน์โหลดใบเสร็จซ้ำได้ภายในอายุของลิงก์
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
      <ReceiptCopyDialog open={copyOpen} data={vendorData} pdfPath={copyPdfPath} onClose={() => setCopyOpen(false)} />
      </>
    )
  }
  if (!t)
    return (
      <StateCard
        title="ลิงก์ไม่ถูกต้องหรือหมดอายุ"
        body={`ลิงก์นี้อาจหมดอายุ (เกิน ${loadSettings().linkExpiryDays} วัน) หรือถูกเพิกถอน โปรดติดต่อลูกค้าผู้จ่ายเพื่อขอลิงก์ใหม่`}
        brand={brand}
      />
    )

  const consentInfo = consentInfoFor(t)

  // Length-only for now — checksum policy comes later. Once the gate is passed
  // on this device the ID is already proven, so it need not be retyped.
  const idOk = tid.replace(/\D/g, '').length === 13 || (gatePassed && !!t.taxIdLast4)
  const drawnEmpty = !drew || padRef.current?.isEmpty()
  const typedEmpty = signMode === 'type' && typedName.trim().length < 2
  const signatureOk = signMode === 'type' ? !typedEmpty : !drawnEmpty
  const prefixOk = !prefixRequired(name) || isVendorPrefix(prefix)
  const phoneOk = isValidPhone(phone)
  const emailOk = isValidEmail(email)
  const valid = name.trim().length >= 2 && prefixOk && address.trim().length >= 6 && phoneOk && emailOk && idOk && consent && signatureOk

  const needsGate = !!t.taxIdHash && !unlocked

  const unlock = async () => {
    if (!token || gateBusy) return
    setGateBusy(true)
    setGateErr('')
    const res = await tryGateUnlock(token, t, gateId)
    setRemaining(res.remaining)
    if (res.ok) {
      setUnlocked(true)
      setGatePassed(!!t.taxIdHash)
      setTid(gateId) // reuse verified ID for the signing snapshot
      // The server withholds document content until the gate is passed, so pull
      // it now and prefill from the revealed record (vendor confirms, not retypes).
      const fresh = (await refetch()).data
      if (fresh) {
        setPrefix(fresh.vendor.prefix ?? '')
        setName(fresh.vendor.name)
        setAddress(fresh.vendor.address)
        setPhone(fresh.vendor.phone ?? '')
        setEmail(fresh.vendor.email ?? '')
      }
      setGateId('')
      window.scrollTo(0, 0)
    } else {
      setGateErr(
        res.remaining <= 0
          ? 'พยายามเกินกำหนด — ลิงก์นี้ถูกล็อกชั่วคราว โปรดติดต่อลูกค้าผู้จ่าย'
          : `เลขไม่ตรงกับที่ลูกค้าผู้จ่ายระบุ (เหลือ ${res.remaining} ครั้ง) — โปรดอย่าดำเนินการต่อหากไม่ใช่ท่าน`,
      )
    }
    setGateBusy(false)
  }

  if (needsGate)
    return (
      <Shell brand={brand}>
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
        consentVersion: consentInfo.version,
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
              : res.error === 'consent-version-mismatch'
                ? 'ข้อความให้ความยินยอมมีการแก้ไข — โปรดรีเฟรชหน้านี้แล้วตรวจสอบอีกครั้งก่อนลงนาม'
                : res.error === 'invalid-phone'
                  ? PHONE_REQUIRED_ERROR
                  : res.error === 'invalid-email'
                    ? EMAIL_REQUIRED_ERROR
                    : 'ส่งข้อมูลไม่สำเร็จ โปรดลองอีกครั้งหรือติดต่อลูกค้าผู้จ่าย',
        )
        return
      }
      if (res.authRef) setAuthRef(res.authRef)
      const number = res.number ?? t.receiptNumber ?? 'ยังไม่ออกเลข'
      if (res.number) setReceipt({ number: res.number, verificationCode: res.verificationCode ?? '' })
      // Snapshot the sheet now: the invite token is consumed, so the transaction
      // cannot be fetched again to render the receipt later. Buyer + consent
      // version come from the sign response when present (server), falling back
      // to workspace settings so the vendor's copy matches the client's.
      const s = loadSettings(t.tenantId)
      setVendorData(
        buildVendorReceiptData(
          t,
          {
            number,
            client: res.client ?? {
              displayName: t.clientName || s.displayName,
              address: s.address,
              taxId: s.taxId,
            },
            vendor: {
              prefix: auth.vendorPrefix,
              name: auth.vendorName,
              address: auth.vendorAddress,
              phone: auth.vendorPhone,
              email: auth.vendorEmail,
              taxId: t.vendor.taxId,
              maskedId: t.vendor.maskedId,
            },
            signedAt: auth.signedAt,
            sigMethod: auth.verificationMethod,
            authRef: res.authRef,
            consentVersion: res.consentVersion ?? auth.consentVersion,
            verificationCode: res.verificationCode,
            issueDate: new Date().toISOString().slice(0, 10),
          },
          { kind: 'ready', png: auth.signaturePng },
        ),
      )
      setDone(true)
      window.scrollTo(0, 0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell brand={brand}>
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
                <Label required>โทรศัพท์</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" autoComplete="tel" />
                {tried && !phoneOk && <FieldError msg={PHONE_REQUIRED_ERROR} />}
              </div>
              <div>
                <Label required>อีเมล</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
                {tried && !emailOk && <FieldError msg={EMAIL_REQUIRED_ERROR} />}
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
                <Input value={tid} onChange={(e) => setTid(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="x-xxxx-xxxxx-xx-x" inputMode="numeric" autoCapitalize="none" spellCheck={false} enterKeyHint="done" />
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
              <span>{consentInfo.summary}</span>
            </label>

            <details className="rounded-control border border-card-border">
              <summary className="cursor-pointer px-3.5 py-2.5 text-label font-medium text-primary-text">
                อ่านข้อความให้ความยินยอมฉบับเต็ม
              </summary>
              <div className="border-t border-card-border px-3.5 py-3">
                <ConsentBody text={consentInfo.text} />
              </div>
            </details>

            <PdpaNotice
              text={PDPA_STATEMENT}
              detail={
                <p>
                  ข้อมูลที่เก็บ: ชื่อ ที่อยู่ เลขบัตรประชาชน (เข้ารหัส) ลายเซ็น และเวลายืนยัน — ใช้เพื่อออกใบเสร็จสำหรับธุรกรรมนี้เท่านั้น ·
                  ผู้ที่เข้าถึงข้อมูล: ลูกค้าผู้จ่ายและนักบัญชี · ระยะเวลาจัดเก็บ: ตามนโยบายของลูกค้าผู้จ่าย
                </p>
              }
            />

            <p className="text-label leading-relaxed text-ink-400">
              เอกสารนี้จัดทำโดย <b>{consentInfo.clientName}</b> ในนามของผู้รับเงินโดยได้รับมอบอำนาจผ่านการลงนามอิเล็กทรอนิกส์ · ข้อตกลงความยินยอม ฉบับที่ {consentInfo.version}
            </p>
            {tried && !consent && <FieldError msg="กรุณายืนยันความยินยอมก่อนส่ง" />}
          </CardBody>
        </Card>
      </div>
      <ActionBar>
        {submitErr && <FieldError msg={submitErr} />}
        <Button type="button" className="mt-1.5 w-full py-3.5 text-base" onClick={submit} loading={submitting}>
          {submitting ? 'กำลังส่งข้อมูล…' : 'ลงนามรับเงินและส่งข้อมูล'}
        </Button>
      </ActionBar>
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
