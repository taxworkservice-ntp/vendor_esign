import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { KeyRound, PauseCircle, PlayCircle } from 'lucide-react'
import { useAdminTenant, useCreateUser, useTenantUsers, useUpdateTenant, useUserActions } from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'

type AdminConfirm =
  | { kind: 'suspend' }
  | { kind: 'activate' }
  | { kind: 'reset'; userId: string; email: string }
  | { kind: 'disable'; userId: string; email: string }

export function ClientDetail() {
  const { id } = useParams()
  const { data: t } = useAdminTenant(id)
  const { data: users, refetch } = useTenantUsers(id)
  const update = useUpdateTenant(id)
  const createUser = useCreateUser(id)
  const actions = useUserActions(id)
  const [tab, setTab] = useState<'info' | 'users' | 'config'>('info')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'manager' | 'officer'>('officer')
  const [tempPw, setTempPw] = useState('')
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<AdminConfirm | null>(null)

  const runConfirm = () => {
    if (!confirm) return
    if (confirm.kind === 'suspend') void update.mutateAsync({ status: 'suspended' })
    else if (confirm.kind === 'activate') void update.mutateAsync({ status: 'active' })
    else if (confirm.kind === 'disable') void actions.disable(confirm.userId)
    else if (confirm.kind === 'reset') {
      const u = confirm
      void actions.reset(u.userId).then((pw) => setTempPw(pw))
    }
    setConfirm(null)
  }

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

  if (!t) return <p className="py-10 text-center text-body text-ink-500">กำลังโหลด…</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${t.clientCode} · ${t.displayName}`}
        sub={`ชุดเลขที่ ${t.clientCode}-R-${t.beYear}- · เริ่มที่ ${t.startNumber} · สถานะ ${t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}`}
        actions={
          t.status === 'active'
            ? <Button variant="secondary" onClick={() => setConfirm({ kind: 'suspend' })}><PauseCircle size={16} /> ระงับ</Button>
            : <Button variant="secondary" onClick={() => setConfirm({ kind: 'activate' })}><PlayCircle size={16} /> เปิดใช้งาน</Button>
        }
      />

      <div className="flex gap-1.5">
        {([['info', 'ข้อมูล'], ['users', `ผู้ใช้ (${users?.length ?? 0})`], ['config', 'การตั้งค่า']] as const).map(([v, th]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-full px-3.5 py-2 text-body font-semibold transition ${
              tab === v ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-100'
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
            <div><Label>รหัส / ชุดเลขที่</Label><p className="font-mono">{t.clientCode}-R-{t.beYear}-NNNN</p></div>
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
              <Label>สร้างผู้ใช้ใหม่ (ผู้ดูแลระบบกำหนดรหัสผ่านชั่วคราวให้ ผู้ใช้ต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="email@client.co.th" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
                <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="sm:w-56">
                  <option value="owner">เจ้าของบัญชี — จัดการได้ทั้งหมด</option>
                  <option value="manager">ผู้จัดการ — ตามสิทธิ์ที่กำหนด</option>
                  <option value="officer">เจ้าหน้าที่ — ตามสิทธิ์ที่กำหนด</option>
                </Select>
                <Button onClick={makeUser} loading={createUser.isPending} disabled={!email.trim()}>
                  {createUser.isPending ? 'กำลังสร้าง…' : 'สร้างและออกรหัสผ่านชั่วคราว'}
                </Button>
              </div>
              <FieldError msg={err} />
              {tempPw && (
                <div className="rounded-control bg-amber-50 p-3 text-body">
                  <p className="font-semibold text-amber-800">รหัสผ่านชั่วคราว (แสดงเพียงครั้งเดียว — โปรดส่งให้ผู้ใช้ผ่านช่องทางอื่น แล้วระบบจะบังคับให้เปลี่ยน):</p>
                  <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{tempPw}</p>
                  <p className="mt-1 text-label text-amber-700">หมดอายุใน 7 วัน · ไม่ถูกจัดเก็บเป็นข้อความธรรมดาในฐานข้อมูล (จัดเก็บเฉพาะค่าแฮช scrypt)</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead>
                <tr className="border-b border-card-border bg-ink-50/80">
                  <th className="px-4 py-3 text-left text-label font-semibold uppercase tracking-wide text-ink-500">อีเมล</th>
                  <th className="px-4 py-3 text-left text-label font-semibold uppercase tracking-wide text-ink-500">บทบาท</th>
                  <th className="px-4 py-3 text-left text-label font-semibold uppercase tracking-wide text-ink-500">สถานะ</th>
                  <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-ink-500">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-card-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{u.email}</span>
                      {u.mustChangePw && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-label font-semibold text-amber-800">รอเปลี่ยนรหัส</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-body">{u.role}</td>
                    <td className="px-4 py-3">{u.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-body"
                          onClick={() => setConfirm({ kind: 'reset', userId: u.id, email: u.email })}
                        >
                          <KeyRound size={14} /> ตั้งรหัสใหม่
                        </Button>
                        {u.status === 'active' && (
                          <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => setConfirm({ kind: 'disable', userId: u.id, email: u.email })}>
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
          <CardBody className="space-y-2 text-body">
            <p>อัตราภาษีหัก ณ ที่จ่าย · เกณฑ์เตือนอากรแสตมป์ · อายุลิงก์ผู้ขาย · ข้อความให้ความยินยอม — แยกตามลูกค้าแต่ละราย</p>
            <p className="text-ink-500">ผู้ดูแลลูกค้าปรับค่าเหล่านี้ได้ที่เมนู “ตั้งค่า” ของลูกค้ารายนั้น ส่วนหน้านี้เป็นมุมมองผู้ดูแลระบบ</p>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirm !== null}
        tone={confirm?.kind === 'activate' ? 'primary' : 'danger'}
        title={
          confirm?.kind === 'suspend' ? 'ยืนยันการระงับลูกค้า'
            : confirm?.kind === 'activate' ? 'ยืนยันการเปิดใช้งานลูกค้า'
              : confirm?.kind === 'disable' ? 'ยืนยันการปิดใช้งานผู้ใช้'
                : 'ยืนยันการตั้งรหัสผ่านใหม่'
        }
        message={
          confirm?.kind === 'suspend' ? 'ลูกค้ารายนี้และผู้ใช้ทั้งหมดจะไม่สามารถเข้าใช้งานระบบได้ จนกว่าจะเปิดใช้งานอีกครั้ง'
            : confirm?.kind === 'activate' ? 'ลูกค้ารายนี้และผู้ใช้ทั้งหมดจะกลับมาใช้งานระบบได้ตามปกติ'
              : confirm?.kind === 'disable' ? <>ผู้ใช้ <b>{confirm.email}</b> จะไม่สามารถเข้าสู่ระบบได้อีก</>
                : confirm?.kind === 'reset' ? <>ระบบจะออก <b>รหัสผ่านชั่วคราว</b> ใหม่ให้ <b>{confirm.email}</b> และรหัสเดิมจะใช้ไม่ได้ทันที</>
                  : ''
        }
        confirmLabel={confirm?.kind === 'suspend' ? 'ระงับลูกค้า' : confirm?.kind === 'activate' ? 'เปิดใช้งาน' : confirm?.kind === 'disable' ? 'ปิดใช้งาน' : 'ตั้งรหัสใหม่'}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
