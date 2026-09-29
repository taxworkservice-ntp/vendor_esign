import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, MOCK_MODE } from '../../lib/auth'
import { MOCK_HINT } from '../../lib/mock-users'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'

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
    <div className="mx-auto max-w-md space-y-5 pt-10">
      <PageHeader title="เข้าสู่ระบบ" sub="รหัสผ่านออกโดย admin — login ครั้งแรกจะบังคับเปลี่ยนรหัส" />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>อีเมล</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@client.co.th" /></div>
          <div>
            <Label>รหัสผ่าน</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <FieldError msg={err} />
          <Button onClick={submit} disabled={busy || !email || !password} className="w-full">
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </Button>
          {MOCK_MODE && (
            <div className="rounded-control bg-amber-50 p-3 text-body text-amber-800">
              <p className="font-semibold">โหมดทดสอบ (ในเครื่องนี้)</p>
              <p className="mt-0.5 font-mono">{MOCK_HINT}</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
