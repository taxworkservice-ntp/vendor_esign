import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateVendor } from '../hooks/useVendors'
import { useClientAuth } from '../lib/client-auth'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { bankValidation } from '../lib/bank-account'
import { BankSelect } from '../components/vendors/bank-select'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Checkbox } from '../components/ui/checkbox'
import { ErrorState } from '../components/ui/error-state'

export function VendorNew() {
  const nav = useNavigate()
  // Display-only mirror of the server gate: without the flag the form would
  // only fail on submit, so it is not shown at all.
  const { can } = useClientAuth()
  const create = useCreateVendor()
  const [prefix, setPrefix] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [sameAsName, setSameAsName] = useState(false)
  const [err, setErr] = useState('')

  const sameHolder = sameAsName ? name.trim() : accountHolder.trim()

  const submit = async () => {
    setErr('')
    if (name.trim().length < 2) {
      setErr('กรุณากรอกชื่อผู้ขาย')
      return
    }
    if (prefixRequired(name) && !isVendorPrefix(prefix)) {
      setErr('กรุณาเลือกคำนำหน้าชื่อ')
      return
    }
    if (address.trim().length < 4) {
      setErr('กรุณากรอกที่อยู่ผู้ขาย')
      return
    }
    if (taxId.replace(/\D/g, '').length !== 13) {
      setErr('กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก')
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }
    const bankErr = bankValidation({ bankName, bankAccount, accountHolder: sameHolder })
    if (bankErr) {
      setErr(bankErr)
      return
    }
    try {
      const v = await create.mutateAsync({ prefix, name, address, taxId, lineUserId, phone, email, bankName, bankAccount, accountHolder: sameHolder })
      nav(`/vendors/${v.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  if (!can('canManageVendors')) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="เพิ่มผู้ขาย"
          sub="ผู้ขายรายย่อย (ไม่จด VAT) — เก็บชื่อ/ที่อยู่/เลขบัตรประชาชน เพื่อออกใบเสร็จรับเงิน"
          breadcrumb={[{ to: '/vendors', label: 'ผู้ขาย' }, { label: 'เพิ่มผู้ขาย' }]}
        />
        <Card>
          <ErrorState
            title="ไม่มีสิทธิ์เพิ่มผู้ขาย"
            description="ต้องมีสิทธิ์จัดการผู้ขายจึงเพิ่มรายใหม่ได้ ติดต่อเจ้าของบัญชี"
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="เพิ่มผู้ขาย"
        sub="ผู้ขายรายย่อย (ไม่จด VAT) — เก็บชื่อ/ที่อยู่/เลขบัตรประชาชน เพื่อออกใบเสร็จรับเงิน"
        breadcrumb={[{ to: '/vendors', label: 'ผู้ขาย' }, { label: 'เพิ่มผู้ขาย' }]}
      />
      <Card>
        <CardBody className="space-y-4">
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
              <Label required>ชื่อผู้ขาย</Label>
              <Input placeholder="เช่น สมชาย ใจดี" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label required>ที่อยู่</Label>
            <Input placeholder="บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="13 หลัก" required>เลขบัตรประชาชน</Label>
              <Input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                placeholder="0xxxxxxxxxxxx"
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div>
              <Label hint="ไม่บังคับ">LINE user id</Label>
              <Input value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} placeholder="U…" className="font-mono" />
            </div>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="ไม่บังคับ">ธนาคาร</Label>
              <BankSelect value={bankName} onChange={setBankName} />
            </div>
            <div>
              <Label hint="ไม่บังคับ">เลขที่บัญชี</Label>
              <Input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="xxx-x-xxxxx-x"
                inputMode="numeric"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <Label hint="ไม่บังคับ · ตามสมุดบัญชี">ชื่อบัญชี</Label>
            <Input value={sameAsName ? name : accountHolder} disabled={sameAsName} onChange={(e) => setAccountHolder(e.target.value)} placeholder="ชื่อตามสมุดบัญชี" />
            <Checkbox
              className="mt-2"
              checked={sameAsName}
              onChange={(e) => setSameAsName(e.target.checked)}
              label="ใช้ชื่อผู้ขายเป็นชื่อบัญชี"
            />
          </div>
          <FieldError msg={err} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกผู้ขาย'}
            </Button>
            <Button variant="secondary" onClick={() => nav('/vendors')}>ยกเลิก</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
