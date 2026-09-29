import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientAuth } from '../lib/client-auth'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'

const API = (import.meta.env.VITE_API_BASE ?? '') as string

export function ClientChangePassword() {
  const nav = useNavigate()
  const { refresh } = useClientAuth()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (newPw.length < 8) {
      setErr('รหัสใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร')
      return
    }
    setBusy(true)
    try {
      if (API) {
        const r = await fetch(`${API}/api/auth/change-password`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
        })
        if (!r.ok) throw new Error('change-failed')
        await refresh()
      }
      nav('/')
    } catch {
      setErr('เปลี่ยนรหัสไม่สำเร็จ — ตรวจสอบรหัสเดิม')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-10">
      <PageHeader title="เปลี่ยนรหัสผ่าน" sub="รหัสชั่วคราวจากผู้ดูแลระบบใช้ได้ 7 วัน — ตั้งรหัสใหม่เพื่อใช้งานต่อ" />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>รหัสเดิม (ชั่วคราว)</Label><Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} /></div>
          <div><Label hint="≥ 8 ตัวอักษร">รหัสผ่านใหม่</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
          <FieldError msg={err} />
          <Button onClick={submit} disabled={busy || !oldPw || !newPw} className="w-full">
            {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสใหม่'}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
