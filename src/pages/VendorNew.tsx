import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateVendor } from '../hooks/useVendors'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'

export function VendorNew() {
  const nav = useNavigate()
  const create = useCreateVendor()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    setErr('')
    if (taxId.replace(/\D/g, '').length !== 13) {
      setErr('กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก')
      return
    }
    try {
      const v = await create.mutateAsync({ name, address, taxId, lineUserId })
      nav(`/vendors/${v.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="เพิ่มผู้ขาย" sub="ผู้ขายรายย่อย (ไม่จด VAT) — เก็บชื่อ/ที่อยู่/เลขบัตรประชาชน เพื่อออกใบเสร็จรับเงิน" />
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label>ชื่อผู้ขาย</Label>
            <Input placeholder="เช่น สมชาย ใจดี" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>ที่อยู่</Label>
            <Input placeholder="บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="13 หลัก">เลขบัตรประชาชน</Label>
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
          <FieldError msg={err} />
          <div className="flex gap-2">
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึกผู้ขาย'}
            </Button>
            <Button variant="secondary" onClick={() => nav('/vendors')}>ยกเลิก</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
