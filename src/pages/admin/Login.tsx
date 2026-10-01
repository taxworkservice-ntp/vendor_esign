import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, MOCK_MODE } from '../../lib/auth'
import { MOCK_HINT } from '../../lib/mock-users'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'
import { PasswordInput } from '../../components/ui/password-input'

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    setBusy(true)
    try {
      const j = await login(email.trim(), password)
      nav(j.mustChangePw ? '/change-password' : '/admin/clients')
    } catch {
      setErr('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="เข้าสู่ระบบ" sub="สำหรับผู้ดูแลระบบ · รหัสผ่านออกโดยผู้ดูแลระบบ — การเข้าสู่ระบบครั้งแรกจะบังคับให้เปลี่ยนรหัสผ่าน" />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>อีเมล</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@client.co.th" /></div>
          <div>
            <Label>รหัสผ่าน</Label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} invalid={!!err} />
          </div>
          <FieldError msg={err} />
          <Button onClick={submit} loading={busy} disabled={!email || !password} className="w-full">
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </Button>
          {MOCK_MODE && (
            <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
              <p className="font-semibold">โหมดทดสอบ (ภายในเครื่องนี้)</p>
              <p className="mt-0.5 font-mono">{MOCK_HINT}</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
