import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { KeyRound, PauseCircle, PlayCircle } from 'lucide-react'
import { useAdminTenant, useCreateUser, useTenantUsers, useUpdateTenant, useUserActions } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'

export function ClientDetail() {
  const { id } = useParams()
  const { data: t } = useAdminTenant(id)
  const { data: users, refetch } = useTenantUsers(id)
  const update = useUpdateTenant(id)
  const createUser = useCreateUser(id)
  const actions = useUserActions(id)
  const [tab, setTab] = useState<'info' | 'users' | 'config'>('info')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'client_user' | 'client_admin'>('client_user')
  const [tempPw, setTempPw] = useState('')
  const [err, setErr] = useState('')

  const makeUser = async () => {
    setErr('')
    setTempPw('')
    try {
      const j = await createUser.mutateAsync({ email, role })
      setTempPw(j.tempPassword)
      setEmail('')
      void refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ')
    }
  }

  if (!t) return <p className="py-10 text-center text-sm text-ink-500">กำลังโหลด…</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${t.clientCode} · ${t.displayName}`}
        sub={`Series ${t.clientCode}-R-${t.beYear}- · เริ่มที่ ${t.startNumber} · สถานะ ${t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}`}
        actions={
          t.status === 'active'
            ? <Button variant="secondary" onClick={() => update.mutateAsync({ status: 'suspended' })}><PauseCircle size={16} /> ระงับ</Button>
            : <Button variant="secondary" onClick={() => update.mutateAsync({ status: 'active' })}><PlayCircle size={16} /> เปิดใช้งาน</Button>
        }
      />

      <div className="flex gap-1.5">
        {([['info', 'ข้อมูล'], ['users', `ผู้ใช้ (${users?.length ?? 0})`], ['config', 'Config']] as const).map(([v, th]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === v ? 'bg-ink-900 text-white' : 'bg-slate-100 text-ink-700 hover:bg-slate-200'
            }`}
          >
            {th}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div><Label>ชื่อแสดงบนใบเสร็จ</Label><p className="font-semibold">{t.displayName}</p></div>
            <div><Label>รหัส / Series</Label><p className="font-mono">{t.clientCode}-R-{t.beYear}-NNNN</p></div>
            <div className="sm:col-span-2"><Label>ที่อยู่ผู้ซื้อ</Label><p>{t.address || '— ยังไม่กรอก'}</p></div>
            <div><Label>เลขภาษี</Label><p className="font-mono">{t.taxId || '—'}</p></div>
            <div><Label>ผู้ติดต่อ</Label><p>{t.contactName || '—'}</p></div>
          </CardBody>
        </Card>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <Label>สร้างผู้ใช้ใหม่ (admin ตั้งรหัสผ่านชั่วคราวให้ — ผู้ใช้ต้องเปลี่ยนตอน login ครั้งแรก)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="email@client.co.th" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[15px]">
                  <option value="client_user">client_user — ใช้งานทั่วไป</option>
                  <option value="client_admin">client_admin — จัดการผู้ใช้ในลูกค้านี้</option>
                </select>
                <Button onClick={makeUser} disabled={createUser.isPending || !email.trim()}>
                  {createUser.isPending ? 'กำลังสร้าง…' : 'สร้าง + ออกรหัสชั่วคราว'}
                </Button>
              </div>
              <FieldError msg={err} />
              {tempPw && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-800">รหัสชั่วคราว (แสดงครั้งเดียว — ส่งให้ผู้ใช้นอกระบบ แล้วบังคับเปลี่ยน):</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wide">{tempPw}</p>
                  <p className="mt-1 text-xs text-amber-700">หมดอายุใน 7 วัน · ไม่ถูกเก็บเป็น plaintext ใน DB (เก็บเฉพาะ scrypt hash)</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">อีเมล</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">บทบาท</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">สถานะ</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{u.email}</span>
                      {u.mustChangePw && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">รอเปลี่ยนรหัส</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px]">{u.role}</td>
                    <td className="px-4 py-3">{u.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-[13px]"
                          onClick={async () => {
                            const pw = await actions.reset(u.id)
                            setTempPw(pw)
                          }}
                        >
                          <KeyRound size={14} /> รีเซ็ต
                        </Button>
                        {u.status === 'active' && (
                          <Button variant="secondary" className="h-9 px-3 text-[13px]" onClick={() => actions.disable(u.id)}>
                            ปิดใช้งาน
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'config' && (
        <Card>
          <CardBody className="space-y-2 text-sm">
            <p>อัตราภาษีหัก ณ ที่จ่าย · เกณฑ์เตือนอากรแสตมป์ · อายุลิงก์ผู้ขาย · ข้อความยินยอม — แยกตามลูกค้าแต่ละราย</p>
            <p className="text-ink-500">ผู้ดูแลลูกค้าปรับค่าเหล่านี้ได้ที่เมนู “ตั้งค่า” ของลูกค้ารายนั้น ส่วนหน้านี้เป็นมุมมองผู้ดูแลระบบ</p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
