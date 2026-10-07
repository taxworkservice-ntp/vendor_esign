import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Eye, KeyRound, PauseCircle, Pencil, PlayCircle, Power, PowerOff, ShieldOff, Trash2 } from 'lucide-react'
import {
  useAdminTenant,
  useCreateUser,
  useDeleteTenant,
  useImpersonate,
  useTenantUsers,
  useUpdateTenant,
  useUserActions,
} from '../../hooks/useAdmin'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { FieldError, Input, Label } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { useToast } from '../../components/ui/toast'
import { buildFirstLoginMessage } from '../../lib/admin-invite-message'

type AdminConfirm =
  | { kind: 'suspend' }
  | { kind: 'activate' }
  | { kind: 'delete' }

export function ClientDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: t } = useAdminTenant(id)
  const { data: users, refetch } = useTenantUsers(id)
  const update = useUpdateTenant(id)
  const del = useDeleteTenant()
  const createUser = useCreateUser(id)
  const actions = useUserActions(id)
  const impersonate = useImpersonate()
  const toast = useToast()
  const [tab, setTab] = useState<'info' | 'users' | 'config'>('info')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'manager' | 'officer'>('officer')
  const [tempPw, setTempPw] = useState('')
  const [createdEmail, setCreatedEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const [impErr, setImpErr] = useState('')
  const [confirm, setConfirm] = useState<AdminConfirm | null>(null)

  const runConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.kind === 'suspend') await update.mutateAsync({ status: 'suspended' })
      else if (confirm.kind === 'activate') await update.mutateAsync({ status: 'active' })
      else if (confirm.kind === 'delete') {
        await del.mutateAsync(id!)
        nav('/admin/clients')
      }
    } catch (e) {
      toast.show(e instanceof Error && e.message === 'tenant-not-empty' ? 'ลบไม่ได้ — ลูกค้ารายนี้มีข้อมูลแล้ว (ใช้ระงับแทน)' : 'ดำเนินการไม่สำเร็จ', 'error')
    }
    setConfirm(null)
  }

  const makeUser = async () => {
    setErr('')
    setTempPw('')
    setCreatedEmail('')
    setCopied(false)
    try {
      const created = email.trim()
      const j = await createUser.mutateAsync({ email: created, role })
      setTempPw(j.tempPassword)
      setCreatedEmail(created)
      setEmail('')
      void refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ')
    }
  }

  const copyInvite = async () => {
    if (!tempPw || !createdEmail) return
    try {
      await navigator.clipboard.writeText(
        buildFirstLoginMessage({
          loginUrl: `${window.location.origin}/login`,
          email: createdEmail,
          tempPassword: tempPw,
        }),
      )
      setCopied(true)
      toast.show('คัดลอกข้อความแจ้งผู้ใช้แล้ว')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
  }

  const startImpersonate = async (mode: 'read' | 'write') => {
    if (!t) return
    setImpErr('')
    try {
      await impersonate.mutateAsync({ tenantId: t.id, mode })
      window.location.assign('/')
    } catch {
      setImpErr('เริ่มดูในนามลูกค้าไม่สำเร็จ')
    }
  }

  if (!t) return <p className="py-10 text-center text-body text-ink-500">กำลังโหลด…</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${t.clientCode} · ${t.displayName}`}
        sub={`ชุดเลขที่ ${t.clientCode}-R-${t.beYear}- · เริ่มที่ ${t.startNumber} · สถานะ ${t.status === 'active' ? 'ใช้งาน' : 'ระงับ'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => void startImpersonate('read')} loading={impersonate.isPending}>
              <Eye size={16} /> ดูในนามลูกค้า
            </Button>
            <Button variant="secondary" onClick={() => void startImpersonate('write')}>
              <Pencil size={16} /> ดูแบบแก้ไขได้
            </Button>
            {t.status === 'active' ? (
              <Button variant="secondary" onClick={() => setConfirm({ kind: 'suspend' })}>
                <PauseCircle size={16} /> ระงับ
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirm({ kind: 'activate' })}>
                <PlayCircle size={16} /> เปิดใช้งาน
              </Button>
            )}
            <Button variant="danger" onClick={() => setConfirm({ kind: 'delete' })}>
              <Trash2 size={16} /> ลบ
            </Button>
          </>
        }
      />
      {impErr && <FieldError msg={impErr} />}

      <div className="flex gap-1.5">
        {([['info', 'ข้อมูล'], ['users', `ผู้ใช้ (${users?.length ?? 0})`], ['config', 'การตั้งค่า']] as const).map(([v, th]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-full border px-3.5 py-2 text-body transition ${
              tab === v
                ? 'border-primary/30 bg-primary-soft font-semibold text-primary-text'
                : 'border-transparent bg-ink-100 font-medium text-ink-700 hover:bg-ink-300/50'
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
              <Label>สร้างผู้ใช้ใหม่ (ผู้ให้บริการกำหนดรหัสผ่านชั่วคราวให้ ผู้ใช้ต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก)</Label>
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
              {tempPw && createdEmail && (
                <div className="rounded-control bg-warning-soft p-3 text-body">
                  <p className="font-semibold text-warning">รหัสผ่านชั่วคราว (แสดงเพียงครั้งเดียว — โปรดส่งให้ผู้ใช้ผ่านช่องทางอื่น แล้วระบบจะบังคับให้เปลี่ยน):</p>
                  <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{tempPw}</p>
                  <p className="mt-1 text-label text-warning">หมดอายุใน 7 วัน · จัดเก็บเฉพาะค่าแฮช scrypt</p>
                  <p className="mt-3 font-semibold text-warning">ข้อความแจ้งผู้ใช้ (คัดลอกไปวางได้เลย):</p>
                  <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-control bg-white/70 p-3 text-body leading-relaxed">
                    {buildFirstLoginMessage({
                      loginUrl: `${window.location.origin}/login`,
                      email: createdEmail,
                      tempPassword: tempPw,
                    })}
                  </pre>
                  <Button variant="secondary" onClick={() => void copyInvite()} className="mt-2">
                    <Copy size={15} /> {copied ? 'คัดลอกข้อความแล้ว' : 'คัดลอกข้อความแจ้งผู้ใช้'}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-body">
                <thead>
                  <tr className="border-b border-card-border bg-ink-50/80">
                    <th className="px-4 py-3 text-left text-label font-medium text-ink-500">อีเมล</th>
                    <th className="px-4 py-3 text-left text-label font-medium text-ink-500">บทบาท</th>
                    <th className="px-4 py-3 text-left text-label font-medium text-ink-500">สถานะ</th>
                    <th className="px-4 py-3 text-right text-label font-medium text-ink-500">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {(users ?? []).map((u) => (
                    <tr key={u.id} className="border-b border-card-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{u.email}</span>
                        {u.mustChangePw && <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-label font-semibold text-warning">รอเปลี่ยนรหัส</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-body">{u.role}</td>
                      <td className="px-4 py-3">{u.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            className="h-9 px-3 text-body"
                            onClick={() => void actions.reset(u.id).then((pw) => setTempPw(pw))}
                          >
                            <KeyRound size={14} /> ตั้งรหัสใหม่
                          </Button>
                          {u.status === 'active' ? (
                            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void actions.disable(u.id)}>
                              <PowerOff size={14} /> ระงับ
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void actions.enable(u.id)}>
                              <Power size={14} /> เปิด
                            </Button>
                          )}
                          <Button variant="ghost" className="h-9 px-3 text-body" title="บังคับเปลี่ยนรหัส" onClick={() => void actions.forceChange(u.id)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" className="h-9 px-3 text-body" title="เพิกถอนเซสชัน" onClick={() => void actions.revokeSessions(u.id)}>
                            <ShieldOff size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'config' && (
        <Card>
          <CardBody className="space-y-2 text-body">
            <p>อัตราภาษีหัก ณ ที่จ่าย · ยอดขั้นต่ำที่ต้องหักภาษี (มาตรา 50/1) · อายุลิงก์ผู้ขาย · ข้อความให้ความยินยอม — แยกตามลูกค้าแต่ละราย</p>
            <p className="text-ink-500">ปรับค่าเหล่านี้ได้ที่เมนู “ตั้งค่า” ของลูกค้ารายนั้น (หรือดูในนามลูกค้าแล้วเข้าเมนูตั้งค่า)</p>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirm !== null}
        tone={confirm?.kind === 'activate' ? 'primary' : 'danger'}
        title={
          confirm?.kind === 'suspend' ? 'ยืนยันการระงับลูกค้า'
            : confirm?.kind === 'activate' ? 'ยืนยันการเปิดใช้งานลูกค้า'
              : 'ยืนยันการลบลูกค้า'
        }
        message={
          confirm?.kind === 'suspend' ? 'ลูกค้ารายนี้และผู้ใช้ทั้งหมดจะไม่สามารถเข้าใช้งานระบบได้ จนกว่าจะเปิดใช้งานอีกครั้ง'
            : confirm?.kind === 'activate' ? 'ลูกค้ารายนี้และผู้ใช้ทั้งหมดจะกลับมาใช้งานระบบได้ตามปกติ'
              : <>ลบเวิร์กสเปซ <b>{t.clientCode}</b> อย่างถาวร — ทำได้เฉพาะเมื่อไม่มีข้อมูล (ธุรกรรม/ใบเสร็จ/ผู้ขาย/รายการ) เท่านั้น มิฉะนั้นให้ใช้ “ระงับ” แทน</>
        }
        confirmLabel={confirm?.kind === 'suspend' ? 'ระงับลูกค้า' : confirm?.kind === 'activate' ? 'เปิดใช้งาน' : 'ลบลูกค้า'}
        busy={del.isPending}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
