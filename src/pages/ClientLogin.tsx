import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientAuth, MOCK_MODE } from '../lib/client-auth'
import { markAdminHint, useAuth } from '../lib/auth'
import { ADMIN_ROLES, findMockUser, hasRole, MOCK_HINT } from '../lib/mock-users'
import { API_BASE } from '../lib/api-base'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { PasswordInput } from '../components/ui/password-input'

const API = API_BASE

// Unified sign-in. One form for everyone: the account type (platform admin vs
// client user) decides the session cookie and the landing page. The response
// only reveals the type after a successful credential check.
export function ClientLogin() {
  const clientAuth = useClientAuth()
  const adminAuth = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Already signed in? Skip the form and go to the right home.
  useEffect(() => {
    if (adminAuth.ready && adminAuth.isPlatformAdmin) nav('/admin', { replace: true })
    else if (clientAuth.ready && clientAuth.email) nav('/', { replace: true })
  }, [adminAuth.ready, adminAuth.isPlatformAdmin, clientAuth.ready, clientAuth.email, nav])

  const toAdmin = (mustChangePw: boolean) => nav(mustChangePw ? '/admin/change-password' : '/admin')
  const toClient = (mustChangePw: boolean) => nav(mustChangePw ? '/change-password' : '/')

  const submit = async () => {
    setErr('')
    setBusy(true)
    try {
      if (MOCK_MODE) {
        const user = findMockUser(email.trim(), password)
        if (!user) throw new Error('invalid-credentials')
        if (hasRole(user, ADMIN_ROLES)) {
          const j = await adminAuth.login(email.trim(), password)
          toAdmin(j.mustChangePw)
        } else {
          const j = await clientAuth.login(email.trim(), password)
          toClient(j.mustChangePw)
        }
        return
      }

      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const j = (await r.json().catch(() => null)) as
        | { ok: true; kind: 'admin' | 'client'; mustChangePw?: boolean; error?: string }
        | { error?: string }
        | null
      if (!r.ok) throw new Error((j as { error?: string })?.error ?? 'login-failed')
      const kind = (j as { kind?: string })?.kind
      const mustChangePw = !!(j as { mustChangePw?: boolean })?.mustChangePw
      if (kind === 'admin') {
        // useAuth.refresh() skips its probe on non-admin routes unless this
        // browser is marked — without it the fresh session is wiped and
        // /admin bounces straight back here with no error.
        markAdminHint()
        await adminAuth.refresh()
        toAdmin(mustChangePw)
      } else {
        await clientAuth.refresh()
        toClient(mustChangePw)
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : 'login-failed'
      setErr(
        code === 'locked'
          ? 'พยายามเข้าสู่ระบบหลายครั้งเกินไป — โปรดลองใหม่ภายหลัง'
          : code === 'temp-expired'
            ? 'รหัสผ่านชั่วคราวหมดอายุ — โปรดขอรหัสใหม่จากผู้ดูแล'
            : code === 'not-a-client-user'
              ? 'บัญชีนี้ไม่ใช่ผู้ใช้ของบริษัท'
              : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="เข้าสู่ระบบ"
        sub="สำหรับลูกค้าและผู้ให้บริการ · รหัสผ่านออกโดยผู้ดูแลระบบ — การเข้าสู่ระบบครั้งแรกจะบังคับให้เปลี่ยนรหัสผ่าน"
      />
      <Card>
        <CardBody className="space-y-4">
          <div><Label>อีเมล</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.co.th" autoComplete="username" /></div>
          <div>
            <Label>รหัสผ่าน</Label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="current-password" invalid={!!err} />
          </div>
          <FieldError msg={err} />
          <Button onClick={submit} loading={busy} disabled={!email || !password} className="w-full">
            {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </Button>
          {MOCK_MODE && (
            <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
              <p className="font-semibold">โหมดสาธิต (Demo) — ใช้ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง</p>
              <p className="mt-0.5">
                บัญชีทดลอง: <span className="font-mono">{MOCK_HINT}</span>
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
