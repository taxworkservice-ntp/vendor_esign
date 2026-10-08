import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, FileImage, Upload } from 'lucide-react'
import { getVendorInviteByToken, submitVendorInvite } from '../lib/vendor-invite-source'
import { CONSENT_VERSION, REQUIRED_DOCS, type VendorInviteDraft } from '../lib/vendor-invite'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { isValidTaxIdChecksum, normalizeTaxId } from '../lib/taxid'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { FieldError, Input, Label, Textarea } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'

// Public vendor self-onboarding form. No account: the invite token is the
// credential. Mobile-first, three sections, resume-friendly (the token keeps
// what was submitted), and PDPA consent before submit.

const MAX_DOC_BYTES = 5 * 1024 * 1024

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read-failed'))
    r.readAsDataURL(file)
  })
}

export function VendorOnboard() {
  const { token } = useParams()
  const q = useQuery({
    queryKey: ['vendor-invite-public', token],
    enabled: !!token,
    retry: false,
    queryFn: () => getVendorInviteByToken(token as string),
  })

  if (q.isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16 text-body text-ink-500">
          <Spinner /> กำลังโหลด…
        </div>
      </Shell>
    )
  }

  const data = q.data
  if (!data) {
    return (
      <Shell>
        <Card>
          <CardBody className="py-12 text-center">
            <p className="font-semibold">ลิงก์ไม่ถูกต้องหรือหมดอายุ</p>
            <p className="mt-1 text-body text-ink-500">กรุณาติดต่อผู้ว่าจ้างเพื่อขอลิงก์ใหม่</p>
          </CardBody>
        </Card>
      </Shell>
    )
  }

  if (data.status === 'approved') {
    return (
      <Shell>
        <Done title="ส่งข้อมูลเรียบร้อยแล้ว" detail="ข้อมูลของท่านได้รับการอนุมัติจากผู้ว่าจ้างแล้ว" />
      </Shell>
    )
  }
  if (data.status === 'rejected') {
    return (
      <Shell>
        <Card>
          <CardBody className="py-12 text-center">
            <p className="font-semibold">ลิงก์นี้ถูกปิดแล้ว</p>
            <p className="mt-1 text-body text-ink-500">กรุณาติดต่อผู้ว่าจ้างหากต้องการส่งข้อมูลอีกครั้ง</p>
          </CardBody>
        </Card>
      </Shell>
    )
  }
  if (data.status === 'submitted') {
    return (
      <Shell>
        <Done title="ส่งข้อมูลเรียบร้อยแล้ว" detail="กำลังรอผู้ว่าจ้างตรวจสอบ — หากต้องการแก้ไข โปรดติดต่อผู้ว่าจ้าง" />
      </Shell>
    )
  }

  return (
    <Shell>
      <OnboardForm token={token as string} initial={data.draft} reviewNote={data.reviewNote} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/logo.png" alt="" aria-hidden className="h-9 w-9 rounded-full object-contain" />
          <span className="text-title font-semibold tracking-tight">TW VendorSign</span>
        </div>
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

function OnboardForm({
  token,
  initial,
  reviewNote,
}: {
  token: string
  initial?: VendorInviteDraft
  reviewNote?: string
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
  const [idDoc, setIdDoc] = useState<{ data: string; name: string } | null>(null)
  const [bankDoc, setBankDoc] = useState<{ data: string; name: string } | null>(null)
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const progress = useMemo(() => {
    const steps = [
      name.trim().length >= 2 && address.trim().length >= 4,
      normalizeTaxId(taxId).length === 13,
      !!bankName.trim() && bankAccount.trim().length >= 8 && !!accountHolder.trim(),
      !!idDoc && !!bankDoc && consent,
    ]
    return Math.round((steps.filter(Boolean).length / steps.length) * 100)
  }, [name, address, taxId, bankName, bankAccount, accountHolder, idDoc, bankDoc, consent])

  const onFile = async (which: 'id' | 'bank', file: File | undefined) => {
    setErr('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr('กรุณาแนบไฟล์รูปภาพ (jpg/png)')
      return
    }
    if (file.size > MAX_DOC_BYTES) {
      setErr('ไฟล์รูปต้องมีขนาดไม่เกิน 5MB')
      return
    }
    const data = await readFile(file)
    if (which === 'id') setIdDoc({ data, name: file.name })
    else setBankDoc({ data, name: file.name })
  }

  const submit = async () => {
    setErr('')
    if (name.trim().length < 2) return setErr('กรุณากรอกชื่อ-นามสกุล')
    if (prefixRequired(name) && !isVendorPrefix(prefix)) return setErr('กรุณาเลือกคำนำหน้าชื่อ')
    if (address.trim().length < 4) return setErr('กรุณากรอกที่อยู่')
    const id = normalizeTaxId(taxId)
    if (id.length !== 13) return setErr('เลขบัตรประชาชนต้องเป็นเลข 13 หลัก')
    if (!isValidTaxIdChecksum(id)) return setErr('เลขบัตรประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)')
    if (!bankName.trim()) return setErr('กรุณากรอกธนาคาร')
    if (bankAccount.replace(/\D/g, '').length < 8) return setErr('กรุณากรอกเลขบัญชีให้ถูกต้อง')
    if (!accountHolder.trim()) return setErr('กรุณากรอกชื่อบัญชี')
    if (!idDoc) return setErr('กรุณาแนบรูปบัตรประชาชน')
    if (!bankDoc) return setErr('กรุณาแนบหน้าสมุดบัญชีธนาคาร')
    if (!consent) return setErr('กรุณายินยอมให้เก็บและใช้ข้อมูล')

    setBusy(true)
    try {
      const res = await submitVendorInvite(
        token,
        { prefix, name, address, phone, email, lineUserId, taxId: id, bankName, bankAccount, accountHolder },
        { idDocData: idDoc.data, idDocName: idDoc.name, bankDocData: bankDoc.data, bankDocName: bankDoc.name },
      )
      if (!res.ok) {
        setErr(res.error === 'invalid-taxid' ? 'เลขบัตรประชาชนไม่ถูกต้อง' : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return <Done title="ส่งข้อมูลเรียบร้อยแล้ว" detail="ข้อมูลของท่านถูกส่งให้ผู้ว่าจ้างตรวจสอบแล้ว" />
  }

  return (
    <div className="space-y-4">
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

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <Section title="1 · ข้อมูลผู้ขาย">
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <Label>คำนำหน้าชื่อ</Label>
            <Select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
              <option value="">—</option>
              {VENDOR_PREFIXES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>ชื่อ-นามสกุล</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี" />
          </div>
        </div>
        <div>
          <Label required>ที่อยู่</Label>
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint="ไม่บังคับ">เบอร์โทรศัพท์</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" />
          </div>
          <div>
            <Label hint="ไม่บังคับ">อีเมล</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
        </div>
        <div>
          <Label hint="ไม่บังคับ">LINE user id</Label>
          <Input value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} placeholder="U…" className="font-mono" />
        </div>
      </Section>

      <Section title="2 · ภาษีและการรับเงิน">
        <div>
          <Label hint="13 หลัก" required>เลขบัตรประชาชน / เลขผู้เสียภาษี</Label>
          <Input
            value={taxId}
            onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
            placeholder="0xxxxxxxxxxxx"
            inputMode="numeric"
            className="font-mono"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label required>ธนาคาร</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="เช่น กสิกรไทย" />
          </div>
          <div>
            <Label required>เลขที่บัญชี</Label>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value.replace(/[^\d-]/g, ''))} placeholder="xxx-x-xxxxx-x" inputMode="numeric" className="font-mono" />
          </div>
        </div>
        <div>
          <Label required>ชื่อบัญชี</Label>
          <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="ชื่อตามสมุดบัญชี" />
        </div>
      </Section>

      <Section title="3 · เอกสารและความยินยอม">
        <DocField
          label={REQUIRED_DOCS[0].label}
          hint={REQUIRED_DOCS[0].hint}
          value={idDoc}
          onPick={(f) => void onFile('id', f)}
        />
        <DocField
          label={REQUIRED_DOCS[1].label}
          hint={REQUIRED_DOCS[1].hint}
          value={bankDoc}
          onPick={(f) => void onFile('bank', f)}
        />
        <Checkbox
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label="ข้าพเจ้ายินยอมให้เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล (รวมถึงสำเนาบัตรประชาชนและบัญชีธนาคาร) เพื่อวัตถุประสงค์ในการยืนยันตัวตน การออกเอกสารทางภาษี และการชำระเงิน"
        />
        <p className="text-label text-ink-400">เวอร์ชันความยินยอม: {CONSENT_VERSION}</p>
      </Section>

      <FieldError msg={err} />
      <Button onClick={submit} loading={busy} className="w-full">
        {busy ? 'กำลังส่ง…' : 'ส่งข้อมูลให้ผู้ว่าจ้าง'}
      </Button>
    </div>
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
  label,
  hint,
  value,
  onPick,
}: {
  label: string
  hint: string
  value: { data: string; name: string } | null
  onPick: (file: File | undefined) => void
}) {
  return (
    <div>
      <Label required>{label}</Label>
      <label className="flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-card-border bg-white p-3 transition hover:border-ink-900">
        {value ? (
          <img src={value.data} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded bg-ink-50 text-ink-400">
            <FileImage size={20} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-body font-medium">{value ? value.name : 'แตะเพื่ออัปโหลด / ถ่ายรูป'}</p>
          <p className="text-label text-ink-400">{hint} · ไม่เกิน 5MB</p>
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <span className="ml-auto shrink-0 text-ink-400">
          <Upload size={16} aria-hidden />
        </span>
      </label>
    </div>
  )
}
