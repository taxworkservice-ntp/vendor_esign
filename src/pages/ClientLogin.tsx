import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientAuth, MOCK_MODE } from '../lib/client-auth'
import { MOCK_HINT } from '../lib/mock-users'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'

export function ClientLogin() {
  const { login } = useClientAuth()
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
      nav(j.mustChangePw ? '/change-password' : '/')
    } catch (e) {
      const code = e instanceof Error ? e.message : 'login-failed'
      setErr(
        code === 'locked'
          ? 'พยายามเข้าสู่ระบบหลายครั้งเกินไป — ลองใหม่ภายหลัง'
          : code === 'not-a-client-user'
            ? 'บัญชีนี้ไม่ใช่ผู้ใช้ฝั่งลูกค้า'
            : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-10">
      <PageHeader title="เข้าสู่ระบบ (ลูกค้า)" sub="รหัสผ่านออกโดยผู้ดูแลระบบ — ครั้งแรกจะบังคับเปลี่ยนรหัส" />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>อีเมล</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@client.co.th" autoComplete="username" /></div>
          <div>
            <Label>รหัสผ่าน</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="current-password" />
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
