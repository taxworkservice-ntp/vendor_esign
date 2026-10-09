import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateVendor } from '../hooks/useVendors'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired } from '../lib/vendor-name'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'

export function VendorNew() {
  const nav = useNavigate()
  const create = useCreateVendor()
  const [prefix, setPrefix] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

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
    try {
      const v = await create.mutateAsync({ prefix, name, address, taxId, lineUserId, phone, email })
      nav(`/vendors/${v.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
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
