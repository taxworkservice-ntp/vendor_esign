import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateTenant } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'

export function ClientNew() {
  const nav = useNavigate()
  const create = useCreateTenant()
  const [form, setForm] = useState({
    id: '', displayName: '', address: '', taxId: '', contactName: '', beYear: '2569', startNumber: '1',
  })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setErr('')
    const code = form.id.trim().toUpperCase()
    if (!/^[A-Z0-9-]{2,12}$/.test(code)) {
      setErr('รหัสลูกค้าใช้ A-Z 0-9 ยาว 2–12 ตัว (ใช้เป็นคำนำหน้าเลขที่ใบเสร็จ)')
      return
    }
    if (!form.displayName.trim()) {
      setErr('กรุณากรอกชื่อลูกค้า')
      return
    }
    try {
      const j = await create.mutateAsync({
        id: code,
        displayName: form.displayName.trim(),
        address: form.address.trim(),
        taxId: form.taxId.replace(/\D/g, '').slice(0, 13),
        contactName: form.contactName.trim(),
        beYear: Number(form.beYear) || 2569,
        startNumber: Math.max(1, Number(form.startNumber) || 1),
      })
      nav(`/admin/clients/${j.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="เพิ่มลูกค้าใหม่" sub="รหัสใช้เป็นคำนำหน้าเลขที่ใบเสร็จ {CODE}-R-{ปีพ.ศ.}-NNNN แยกชุดเลขที่ตามลูกค้า" />
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>รหัสลูกค้า (CLIENTCODE)</Label>
              <Input placeholder="เช่น ACME" value={form.id} onChange={set('id')} className="font-mono uppercase" />
            </div>
            <div>
              <Label>ชื่อแสดงบนใบเสร็จ</Label>
              <Input placeholder="เช่น บริษัท ตัวอย่าง จำกัด" value={form.displayName} onChange={set('displayName')} />
            </div>
          </div>
          <div>
              <Label>ที่อยู่ผู้ซื้อ (ส่วนผู้ซื้อบนเอกสาร PDF)</Label>
            <Input placeholder="ที่อยู่ + เลขภาษีฉบับจริง" value={form.address} onChange={set('address')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="13 หลัก">เลขภาษีผู้ซื้อ</Label>
              <Input placeholder="0xxxxxxxxxxxx" value={form.taxId} onChange={set('taxId')} className="font-mono" />
            </div>
            <div>
              <Label>ผู้ติดต่อ (LINE/โทร)</Label>
              <Input placeholder="ชื่อผู้ประสานงาน" value={form.contactName} onChange={set('contactName')} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>ปี พ.ศ. เริ่มต้น</Label>
              <Input value={form.beYear} onChange={set('beYear')} className="font-mono" />
            </div>
            <div>
              <Label hint="ใช้ต่อจากเลขเล่มเดิมได้">เลขเริ่มต้น</Label>
              <Input value={form.startNumber} onChange={set('startNumber')} className="font-mono" />
            </div>
          </div>
          <FieldError msg={err || (create.isError ? 'บันทึกไม่สำเร็จ' : undefined)} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'สร้างลูกค้าและเตรียมชุดเลขที่ใบเสร็จ'}
            </Button>
            <Button variant="secondary" onClick={() => nav('/admin/clients')}>ยกเลิก</Button>
          </div>
          <p className="text-label text-ink-400">เมื่อสร้างแล้ว ระบบจะตั้งค่าอัตราภาษีหัก ณ ที่จ่าย อายุลิงก์ผู้ขาย ข้อความให้ความยินยอม และลำดับเลขที่ใบเสร็จเริ่มต้นให้อัตโนมัติ — แยกตามลูกค้าแต่ละราย</p>
        </CardBody>
      </Card>
    </div>
  )
}
