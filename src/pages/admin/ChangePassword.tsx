import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Label } from '../../components/ui/input'
import { PasswordInput } from '../../components/ui/password-input'

const API = ((import.meta.env.VITE_ADMIN_API_BASE ?? '') || (import.meta.env.VITE_API_BASE ?? '')) as string

export function ChangePassword() {
  const nav = useNavigate()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (newPw.length < 10) {
      setErr('รหัสใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร')
      return
    }
    setBusy(true)
    try {
      if (!API) {
        nav('/admin')
        return
      }
      const r = await fetch(`${API}/api/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      })
      if (!r.ok) throw new Error('เปลี่ยนรหัสไม่สำเร็จ — ตรวจสอบรหัสเดิม')
      nav('/admin')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปลี่ยนรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="เปลี่ยนรหัสผ่าน" sub="รหัสผ่านชั่วคราวจากผู้ดูแลระบบใช้ได้ 7 วัน — โปรดตั้งรหัสผ่านใหม่เพื่อใช้งานต่อ" />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>รหัสผ่านชั่วคราว (เดิม)</Label><PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" /></div>
          <div><Label hint="≥ 10 ตัวอักษร">รหัสผ่านใหม่</Label><PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" invalid={!!err} /></div>
          <FieldError msg={err} />
          <Button onClick={submit} loading={busy} disabled={!oldPw || !newPw} className="w-full">
            {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสใหม่'}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
