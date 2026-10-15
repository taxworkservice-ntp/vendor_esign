import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Camera, CheckCircle2, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react'
import { getVendorInviteByToken, submitVendorInvite } from '../lib/vendor-invite-source'
import { CONSENT_VERSION, ONBOARD_PDPA_STATEMENT, VENDOR_DOCS, type VendorInviteDraft } from '../lib/vendor-invite'
import { VENDOR_PREFIXES } from '../lib/vendor-name'
import { normalizeTaxId } from '../lib/taxid'
import { prepareUpload } from '../lib/image-upload'
import { firstInvalidField, validateOnboard, type OnboardErrors, type OnboardField } from '../lib/vendor-onboard'
import { EMAIL_REQUIRED_ERROR, PHONE_REQUIRED_ERROR } from '../lib/vendor-contact'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { PdpaNotice } from '../components/consent/pdpa-notice'
import { SubmissionEvidence } from '../components/vendor/submission-evidence'
import { ActionBar } from '../components/ui/action-bar'
import { FieldError, Input, Label, Textarea } from '../components/ui/input'
import { cn } from '../lib/cn'
import { Select } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import { BrandBar, BrandHeader, type Brand } from '../components/vendor/brand'

// Public vendor self-onboarding form. No account: the invite token is the
// credential. Mobile-first, three sections, per-field validation, image
// downscaling before upload, and a sticky action bar.

const FIELD_IDS: Record<OnboardField, string> = {
  name: 'ob-name',
  prefix: 'ob-prefix',
  address: 'ob-address',
  phone: 'ob-phone',
  email: 'ob-email',
  taxId: 'ob-taxid',
  bankName: 'ob-bankname',
  bankAccount: 'ob-bankaccount',
  accountHolder: 'ob-accountholder',
  idDoc: 'ob-iddoc',
  consent: 'ob-consent',
}

function focusField(field: OnboardField) {
  const el = document.getElementById(FIELD_IDS[field])
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (el instanceof HTMLElement) el.focus({ preventScroll: true })
}

export function VendorOnboard() {
  const { token } = useParams()
  const q = useQuery({
    queryKey: ['vendor-invite-public', token],
    enabled: !!token,
    retry: false,
    queryFn: () => getVendorInviteByToken(token as string),
  })

  const brand: Brand = { clientName: q.data?.clientName, logoUrl: q.data?.logoUrl }
  const [justSubmitted, setJustSubmitted] = useState(false)

  if (q.isLoading) {
    return (
      <Shell brand={brand}>
        <div className="flex items-center justify-center gap-2 py-16 text-body text-ink-500">
          <Spinner /> กำลังโหลด…
        </div>
      </Shell>
    )
  }

  if (q.isError) {
    const status = (q.error as { status?: number } | null)?.status
    const notFound = status === 404 || status === 410
    return (
      <Shell brand={brand}>
        <InfoCard
          title={notFound ? 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' : 'เชื่อมต่อไม่สำเร็จ'}
          body={notFound ? 'กรุณาติดต่อผู้ว่าจ้างเพื่อขอลิงก์ใหม่' : 'การเชื่อมต่อขัดข้องชั่วคราว กรุณาลองอีกครั้ง'}
          onRetry={notFound ? undefined : () => void q.refetch()}
        />
      </Shell>
    )
  }

  const data = q.data
  if (!data) {
    return (
      <Shell brand={brand}>
        <InfoCard title="ลิงก์ไม่ถูกต้องหรือหมดอายุ" body="กรุณาติดต่อผู้ว่าจ้างเพื่อขอลิงก์ใหม่" />
      </Shell>
    )
  }

  const evidence = data.draft ? (
    <SubmissionEvidence
      data={{
        inviteRef: data.ref ?? '',
        submittedAt: data.submittedAt,
        consentVersion: data.consentVersion,
        docs: data.docs,
        draft: data.draft,
        clientName: data.clientName,
        logoUrl: data.logoUrl,
      }}
    />
  ) : null

  if (data.status === 'approved') {
    return (
      <Shell brand={brand}>
        <div className="space-y-4">
          <Done title="ส่งข้อมูลเรียบร้อยแล้ว" detail="ข้อมูลของท่านได้รับการอนุมัติจากผู้ว่าจ้างแล้ว" />
          {evidence}
        </div>
      </Shell>
    )
  }
  if (data.status === 'rejected') {
    return (
      <Shell brand={brand}>
        <InfoCard title="ลิงก์นี้ถูกปิดแล้ว" body="กรุณาติดต่อผู้ว่าจ้างหากต้องการส่งข้อมูลอีกครั้ง" />
      </Shell>
    )
  }
  if (justSubmitted || data.status === 'submitted') {
    return (
      <Shell brand={brand}>
        <div className="space-y-4">
          <Done title="ส่งข้อมูลเรียบร้อยแล้ว" detail="กำลังรอผู้ว่าจ้างตรวจสอบ — หากต้องการแก้ไข โปรดติดต่อผู้ว่าจ้าง" />
          {evidence ?? (
            <div className="flex items-center justify-center gap-2 py-6 text-body text-ink-500">
              <Spinner /> กำลังจัดเตรียมหลักฐาน…
            </div>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell brand={brand}>
      <OnboardForm
        token={token as string}
        initial={data.draft}
        reviewNote={data.reviewNote}
        onSubmitted={() => {
          setJustSubmitted(true)
          void q.refetch()
        }}
      />
    </Shell>
  )
}

function Shell({ children, brand }: { children: React.ReactNode; brand?: Brand }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <BrandBar />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 sm:py-8">
        <BrandHeader brand={brand} />
        {children}
      </div>
    </div>
  )
}

function Done({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <CardBody className="py-12 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={24} aria-hidden />
        </span>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-body text-ink-500">{detail}</p>
      </CardBody>
    </Card>
  )
}

function InfoCard({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardBody className="py-12 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning">
          <AlertTriangle size={22} aria-hidden />
        </span>
        <p className="font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-body text-ink-500">{body}</p>
        {onRetry && (
          <Button variant="secondary" className="mt-4" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden /> ลองใหม่
          </Button>
        )}
      </CardBody>
    </Card>
  )
}

type Doc = { data: string; name: string }

function OnboardForm({
  token,
  initial,
  reviewNote,
  onSubmitted,
}: {
  token: string
  initial?: VendorInviteDraft
  reviewNote?: string
  onSubmitted?: () => void
}) {
  const [prefix, setPrefix] = useState(initial?.prefix ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [lineUserId, setLineUserId] = useState(initial?.lineUserId ?? '')
  const [taxId, setTaxId] = useState(initial?.taxId ?? '')
  const [bankName, setBankName] = useState(initial?.bankName ?? '')
  const [bankAccount, setBankAccount] = useState(initial?.bankAccount ?? '')
  const [accountHolder, setAccountHolder] = useState(initial?.accountHolder ?? '')
  const [idDoc, setIdDoc] = useState<Doc | null>(null)
  const [bankDoc, setBankDoc] = useState<Doc | null>(null)
  const [docBusy, setDocBusy] = useState<'id' | 'bank' | null>(null)
  const [bankDocErr, setBankDocErr] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<OnboardErrors>({})
  const [tried, setTried] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [busy, setBusy] = useState(false)

  const progress = useMemo(() => {
    const steps = [
      name.trim().length >= 2 && address.trim().length >= 4,
      normalizeTaxId(taxId).length === 13,
      !!bankName.trim() && bankAccount.trim().length >= 8 && !!accountHolder.trim(),
      !!idDoc && consent,
    ]
    return Math.round((steps.filter(Boolean).length / steps.length) * 100)
  }, [name, address, taxId, bankName, bankAccount, accountHolder, idDoc, consent])

  const clearError = (k: OnboardField) =>
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))

  const onPick = async (which: 'id' | 'bank', file: File | undefined) => {
    if (!file) return
    if (which === 'id') clearError('idDoc')
    else setBankDocErr('')
    setDocBusy(which)
    try {
      const prepared = await prepareUpload(file, {
        name: which === 'id' ? 'id-card.jpg' : 'bank-book.jpg',
      })
      const doc: Doc = { data: prepared.dataUrl, name: prepared.name }
      if (which === 'id') setIdDoc(doc)
      else setBankDoc(doc)
    } catch (e) {
      const msg =
        e instanceof Error && e.message === 'unsupported-image'
          ? 'ไม่รองรับไฟล์นี้ กรุณาใช้รูป JPG/PNG'
          : 'ประมวลผลรูปไม่สำเร็จ กรุณาลองใหม่'
      if (which === 'id') setErrors((prev) => ({ ...prev, idDoc: msg }))
      else setBankDocErr(msg)
    } finally {
      setDocBusy(null)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitErr('')
    const found = validateOnboard({
      prefix,
      name,
      address,
      phone,
      email,
      taxId,
      bankName,
      bankAccount,
      accountHolder,
      hasIdDoc: !!idDoc,
      consent,
    })
    setErrors(found)
    setTried(true)
    const first = firstInvalidField(found)
    if (first) {
      focusField(first)
      return
    }

    setBusy(true)
    try {
      const res = await submitVendorInvite(
        token,
        { prefix, name, address, phone, email, lineUserId, taxId: normalizeTaxId(taxId), bankName, bankAccount, accountHolder },
        { idDocData: idDoc!.data, idDocName: idDoc!.name, bankDocData: bankDoc?.data, bankDocName: bankDoc?.name },
      )
      if (!res.ok) {
        const err = res.error ?? ''
        if (err === 'invalid-taxid') {
          setErrors({ taxId: 'เลขบัตรประชาชนไม่ถูกต้อง' })
          focusField('taxId')
        } else if (err === 'invalid-phone') {
          setErrors({ phone: PHONE_REQUIRED_ERROR })
          focusField('phone')
        } else if (err === 'invalid-email') {
          setErrors({ email: EMAIL_REQUIRED_ERROR })
          focusField('email')
        } else if (err === 'invalid-document') {
          setErrors({ idDoc: 'รูปบัตรประชาชนไม่ถูกต้อง กรุณาแนบใหม่' })
          focusField('idDoc')
        } else if (err === 'too-many-requests') {
          setSubmitErr('ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
        } else if (err === 'expired' || err === 'closed') {
          setSubmitErr('ลิงก์นี้ปิดหรือหมดอายุแล้ว กรุณาติดต่อผู้ว่าจ้าง')
        } else {
          setSubmitErr('ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')
        }
        return
      }
      window.scrollTo({ top: 0 })
      onSubmitted?.()
    } catch {
      setSubmitErr('ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  const errorCount = Object.values(errors).filter(Boolean).length

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
      <div>
        <h1 className="text-page font-semibold tracking-tight">แบบฟอร์มข้อมูลผู้ขาย</h1>
        <p className="mt-1 text-body text-ink-500">
          กรอกข้อมูลเพื่อให้ผู้ว่าจ้างออกใบเสร็จและโอนเงินได้อย่างถูกต้อง — ใช้เวลาประมาณ 2–3 นาที
        </p>
      </div>

      {reviewNote && (
        <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
          <p className="font-semibold">ผู้ว่าจ้างขอให้แก้ไข</p>
          <p className="mt-0.5">{reviewNote}</p>
        </div>
      )}

      <div className="sticky top-14 z-10 -mx-4 bg-paper/95 px-4 py-2 backdrop-blur">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="ความคืบหน้าการกรอกข้อมูล"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {tried && errorCount > 0 && (
        <div role="alert" className="rounded-control bg-danger-soft p-3 text-body font-medium text-danger">
          กรุณาตรวจสอบข้อมูลที่ทำเครื่องหมายไว้ ({errorCount} จุด)
        </div>
      )}

      <Section title="1 · ข้อมูลผู้ขาย">
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <Label htmlFor="ob-prefix">คำนำหน้าชื่อ</Label>
            <Select id="ob-prefix" value={prefix} invalid={!!errors.prefix} onChange={(e) => { setPrefix(e.target.value); clearError('prefix') }}>
              <option value="">—</option>
              {VENDOR_PREFIXES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <FieldError msg={errors.prefix} />
          </div>
          <div>
            <Label htmlFor="ob-name" required>ชื่อ-นามสกุล</Label>
            <Input id="ob-name" value={name} autoComplete="name" enterKeyHint="next" invalid={!!errors.name}
              onChange={(e) => { setName(e.target.value); clearError('name') }} placeholder="เช่น สมชาย ใจดี" />
            <FieldError msg={errors.name} />
          </div>
        </div>
        <div>
          <Label htmlFor="ob-address" required hint="ที่อยู่ตามบัตรประชาชน/ทะเบียนราษฎร">ที่อยู่</Label>
          <Textarea id="ob-address" value={address} invalid={!!errors.address}
            onChange={(e) => { setAddress(e.target.value); clearError('address') }} rows={2}
            placeholder="บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์ (ตามทะเบียนราษฎร)" />
          <p className="mt-1.5 text-label text-ink-500">
            กรอกที่อยู่ตามที่ปรากฏในเอกสารทะเบียนราษฎร / เลขประจำตัวผู้เสียภาษี (ไม่ใช่ที่อยู่ปัจจุบัน)
          </p>
          <FieldError msg={errors.address} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-phone" required>เบอร์โทรศัพท์</Label>
            <Input id="ob-phone" value={phone} autoComplete="tel" inputMode="tel" enterKeyHint="next" invalid={!!errors.phone}
              onChange={(e) => { setPhone(e.target.value); clearError('phone') }} placeholder="08x-xxx-xxxx" />
            <FieldError msg={errors.phone} />
          </div>
          <div>
            <Label htmlFor="ob-email" required>อีเมล</Label>
            <Input id="ob-email" type="email" value={email} autoComplete="email" enterKeyHint="next" invalid={!!errors.email}
              onChange={(e) => { setEmail(e.target.value); clearError('email') }} placeholder="name@example.com" />
            <FieldError msg={errors.email} />
          </div>
        </div>
        <div>
          <Label htmlFor="ob-line" hint="ไม่บังคับ">LINE user id</Label>
          <Input id="ob-line" value={lineUserId} autoCapitalize="none" spellCheck={false} enterKeyHint="next"
            onChange={(e) => setLineUserId(e.target.value)} placeholder="U…" className="font-mono" />
        </div>
      </Section>

      <Section title="2 · ภาษีและการรับเงิน">
        <div>
          <Label htmlFor="ob-taxid" hint="13 หลัก" required>เลขบัตรประชาชน / เลขผู้เสียภาษี</Label>
          <Input id="ob-taxid" value={taxId} inputMode="numeric" autoCapitalize="none" spellCheck={false} invalid={!!errors.taxId}
            onChange={(e) => { setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13)); clearError('taxId') }}
            placeholder="0xxxxxxxxxxxx" className="font-mono" />
          <FieldError msg={errors.taxId} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-bankname" required>ธนาคาร</Label>
            <Input id="ob-bankname" value={bankName} invalid={!!errors.bankName} enterKeyHint="next"
              onChange={(e) => { setBankName(e.target.value); clearError('bankName') }} placeholder="เช่น กสิกรไทย" />
            <FieldError msg={errors.bankName} />
          </div>
          <div>
            <Label htmlFor="ob-bankaccount" required>เลขที่บัญชี</Label>
            <Input id="ob-bankaccount" value={bankAccount} inputMode="numeric" autoCapitalize="none" spellCheck={false} invalid={!!errors.bankAccount}
              onChange={(e) => { setBankAccount(e.target.value.replace(/[^\d-]/g, '')); clearError('bankAccount') }}
              placeholder="xxx-x-xxxxx-x" className="font-mono" />
            <FieldError msg={errors.bankAccount} />
          </div>
        </div>
        <div>
          <Label htmlFor="ob-accountholder" required>ชื่อบัญชี</Label>
          <Input id="ob-accountholder" value={accountHolder} invalid={!!errors.accountHolder}
            onChange={(e) => { setAccountHolder(e.target.value); clearError('accountHolder') }} placeholder="ชื่อตามสมุดบัญชี" />
          <FieldError msg={errors.accountHolder} />
        </div>
      </Section>

      <Section title="3 · เอกสารและความยินยอม">
        <DocField
          id="ob-iddoc"
          label={VENDOR_DOCS[0].label}
          hint={VENDOR_DOCS[0].hint}
          required={VENDOR_DOCS[0].required}
          value={idDoc}
          busy={docBusy === 'id'}
          error={errors.idDoc}
          onPick={(f) => void onPick('id', f)}
          onClear={() => setIdDoc(null)}
        />
        <DocField
          id="ob-bankdoc"
          label={VENDOR_DOCS[1].label}
          hint={VENDOR_DOCS[1].hint}
          required={VENDOR_DOCS[1].required}
          value={bankDoc}
          busy={docBusy === 'bank'}
          error={bankDocErr || undefined}
          onPick={(f) => void onPick('bank', f)}
          onClear={() => setBankDoc(null)}
        />
        <div>
          <Checkbox
            id="ob-consent"
            checked={consent}
            onChange={(e) => { setConsent(e.target.checked); clearError('consent') }}
            label="ข้าพเจ้ายินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล (รวมถึงเอกสารที่แนบ เช่น สำเนาบัตรประชาชน) เพื่อวัตถุประสงค์ในการยืนยันตัวตน การออกเอกสารทางภาษี และการชำระเงิน"
          />
          <FieldError msg={errors.consent} />
        </div>
        <PdpaNotice text={ONBOARD_PDPA_STATEMENT} />
        <p className="text-label text-ink-400">เวอร์ชันความยินยอม: {CONSENT_VERSION}</p>
      </Section>

      <ActionBar>
        {submitErr && <FieldError msg={submitErr} />}
        <Button type="submit" loading={busy} disabled={docBusy !== null} className="mt-1.5 w-full">
          {busy ? 'กำลังส่ง…' : 'ส่งข้อมูลให้ผู้ว่าจ้าง'}
        </Button>
      </ActionBar>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="text-title font-semibold">{title}</h2>
        {children}
      </CardBody>
    </Card>
  )
}

function DocField({
  id,
  label,
  hint,
  required,
  value,
  busy,
  error,
  onPick,
  onClear,
}: {
  id: string
  label: string
  hint: string
  required?: boolean
  value: Doc | null
  busy?: boolean
  error?: string
  onPick: (file: File | undefined) => void
  onClear: () => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files?.[0])
    e.target.value = ''
  }

  const sourceButton =
    'flex h-11 items-center justify-center gap-2 rounded-control border border-card-border bg-white text-body font-medium text-ink-700 transition hover:border-ink-300 active:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div id={id} tabIndex={-1} className="scroll-mt-24 outline-none">
      <Label required={required} hint={required ? undefined : 'ไม่บังคับ'}>{label}</Label>

      {value ? (
        <div className="rounded-control border border-card-border bg-white p-3">
          <div className="flex items-center gap-3">
            <img src={value.data} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-body font-medium text-success">
                <CheckCircle2 size={15} aria-hidden /> แนบแล้ว
              </p>
              <p className="truncate text-label text-ink-500">{value.name}</p>
            </div>
            <button
              type="button"
              onClick={onClear}
              aria-label={`ลบ${label}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-ink-400 transition hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={sourceButton} disabled={busy} onClick={() => cameraRef.current?.click()}>
              {busy ? <Spinner /> : <Camera size={16} aria-hidden />} ถ่ายใหม่
            </button>
            <button type="button" className={sourceButton} disabled={busy} onClick={() => galleryRef.current?.click()}>
              {busy ? <Spinner /> : <ImageIcon size={16} aria-hidden />} เลือกรูปอื่น
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={sourceButton} disabled={busy} onClick={() => cameraRef.current?.click()}>
            {busy ? <Spinner /> : <Camera size={16} aria-hidden />} ถ่ายรูป
          </button>
          <button type="button" className={sourceButton} disabled={busy} onClick={() => galleryRef.current?.click()}>
            {busy ? <Spinner /> : <ImageIcon size={16} aria-hidden />} เลือกจากอัลบั้ม
          </button>
        </div>
      )}

      <p className={cn('mt-1.5 text-label text-ink-400', error && 'hidden')}>{hint} · รองรับ JPG/PNG</p>
      {error && <FieldError msg={error} />}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={change} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={change} />
    </div>
  )
}
