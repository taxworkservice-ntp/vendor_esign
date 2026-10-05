import { useState } from 'react'
import { KeyRound, Monitor, ShieldAlert } from 'lucide-react'
import { useAdminSessions, useRevokeSession } from '../../hooks/useAdmin'
import { useAuth } from '../../lib/auth'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Label } from '../../components/ui/input'
import { PasswordInput } from '../../components/ui/password-input'
import { EmptyState } from '../../components/ui/empty-state'
import { useToast } from '../../components/ui/toast'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { fmtDateTimeTH } from '../../lib/format'

const API = ((import.meta.env.VITE_ADMIN_API_BASE ?? '') || (import.meta.env.VITE_API_BASE ?? '')) as string

export function Account() {
  const { email } = useAuth()
  const { data: sessions, isLoading } = useAdminSessions()
  const revoke = useRevokeSession()
  const toast = useToast()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const submit = async () => {
    setErr('')
    if (newPw.length < 10) {
      setErr('รหัสใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร')
      return
    }
    setBusy(true)
    try {
      if (API) {
        const r = await fetch(`${API}/api/change-password`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
        })
        if (!r.ok) throw new Error('เปลี่ยนรหัสไม่สำเร็จ — ตรวจสอบรหัสเดิม')
      }
      setOldPw('')
      setNewPw('')
      toast.show('เปลี่ยนรหัสผ่านแล้ว')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปลี่ยนรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="บัญชีของฉัน" sub={`${email ?? ''} · จัดการรหัสผ่านและเซสชันของผู้ให้บริการ`} />

      <Card>
        <CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <KeyRound size={16} className="text-ink-400" aria-hidden /> เปลี่ยนรหัสผ่าน
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>รหัสผ่านเดิม</Label>
              <PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <Label hint="≥ 10 ตัวอักษร">รหัสผ่านใหม่</Label>
              <PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" invalid={!!err} />
            </div>
          </div>
          <FieldError msg={err} />
          <Button onClick={submit} loading={busy} disabled={!oldPw || !newPw}>
            {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสใหม่'}
          </Button>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-card-border px-5 py-3">
          <Monitor size={16} className="text-ink-400" aria-hidden />
          <h2 className="text-body font-semibold">เซสชันที่ใช้งานอยู่</h2>
        </div>
        <CardBody className="space-y-1">
          {isLoading ? (
            <p className="py-4 text-center text-body text-ink-400">กำลังโหลด…</p>
          ) : !sessions || sessions.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="ไม่มีเซสชัน" description="ไม่พบเซสชันที่ยังใช้งานอยู่" />
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-control border border-card-border px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{s.userAgent ?? 'ไม่ทราบอุปกรณ์'}</span>
                  <span className="block text-label text-ink-400">
                    {s.ip ?? '—'} · เริ่ม {fmtDateTimeTH(String(s.createdAt))} · หมดอายุ {fmtDateTimeTH(String(s.expiresAt))}
                  </span>
                </span>
                <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => setConfirmRevoke(s.id)} loading={revoke.isPending}>
                  เพิกถอน
                </Button>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmRevoke !== null}
        tone="danger"
        title="ยืนยันเพิกถอนเซสชัน"
        message="เซสชันนี้ออกจากระบบทันที และต้องเข้าสู่ระบบใหม่"
        confirmLabel="เพิกถอน"
        onConfirm={() => {
          if (confirmRevoke) revoke.mutate(confirmRevoke)
          setConfirmRevoke(null)
        }}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  )
}
