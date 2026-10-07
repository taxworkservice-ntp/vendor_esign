import { useMemo, useState } from 'react'
import { Copy, KeyRound, Pencil, Power, PowerOff, Search, ShieldOff, UserCog } from 'lucide-react'
import { useAllAdminUsers, useUserActions, type AdminDirectoryUser } from '../../hooks/useAdmin'
import { useColumnSort } from '../../hooks/useColumnSort'
import { sortRows, type SortAccessor } from '../../lib/sort'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { TableSkeleton } from '../../components/ui/table-skeleton'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { useToast } from '../../components/ui/toast'
import { Row, SortableTh, Td, Th, tableCls } from '../../components/ui/data-table'
import { cn } from '../../lib/cn'
import { buildFirstLoginMessage } from '../../lib/admin-invite-message'

const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', officer: 'เจ้าหน้าที่' }

const USER_SORT: Record<string, SortAccessor<AdminDirectoryUser>> = {
  email: (u) => u.email,
  tenant: (u) => u.memberships[0]?.tenantId ?? '',
  role: (u) => u.memberships[0]?.role ?? '',
  status: (u) => u.status,
}

type Confirm = { kind: 'disable' | 'revoke' | 'force'; user: AdminDirectoryUser } | null

export function Users() {
  const [q, setQ] = useState('')
  const { data, isLoading, isError, refetch } = useAllAdminUsers(q)
  const actions = useUserActions()
  const toast = useToast()
  const { key: sortKey, dir: sortDir, onSort } = useColumnSort()
  const [tempPw, setTempPw] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const users = useMemo(() => sortRows(data ?? [], sortKey, sortDir, USER_SORT), [data, sortKey, sortDir])

  const reset = async (u: AdminDirectoryUser) => {
    try {
      const pw = await actions.reset(u.id)
      setTempPw(pw)
      setResetEmail(u.email)
      setCopied(false)
      toast.show(`ตั้งรหัสผ่านใหม่ให้ ${u.email} แล้ว`)
    } catch {
      toast.show('ตั้งรหัสใหม่ไม่สำเร็จ', 'error')
    }
  }

  const copyInvite = async () => {
    if (!tempPw || !resetEmail) return
    try {
      await navigator.clipboard.writeText(
        buildFirstLoginMessage({
          loginUrl: `${window.location.origin}/login`,
          email: resetEmail,
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

  const runConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.kind === 'disable') await actions.disable(confirm.user.id)
      else if (confirm.kind === 'revoke') await actions.revokeSessions(confirm.user.id)
      else await actions.forceChange(confirm.user.id)
      toast.show('ดำเนินการแล้ว')
    } catch {
      toast.show('ดำเนินการไม่สำเร็จ', 'error')
    }
    setConfirm(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ผู้ใช้ทั้งหมด" sub="ผู้ใช้ทุกเวิร์กสเปซ · ตั้งรหัสใหม่ · ระงับ/เปิด · บังคับเปลี่ยนรหัส · เพิกถอนเซสชัน" />

      <Card>
        <CardBody>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input className="pl-10" placeholder="ค้นหาอีเมล / รหัสลูกค้า…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
        </CardBody>
      </Card>

      {tempPw && resetEmail && (
        <div className="rounded-control bg-warning-soft p-3 text-body">
          <p className="font-semibold text-warning">รหัสผ่านชั่วคราว (แสดงครั้งเดียว — ส่งให้ผู้ใช้ผ่านช่องทางอื่น):</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{tempPw}</p>
          <p className="mt-3 font-semibold text-warning">ข้อความแจ้งผู้ใช้ (คัดลอกไปวางได้เลย):</p>
          <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-control bg-white/70 p-3 text-body leading-relaxed">
            {buildFirstLoginMessage({
              loginUrl: `${window.location.origin}/login`,
              email: resetEmail,
              tempPassword: tempPw,
            })}
          </pre>
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void copyInvite()}>
              <Copy size={15} /> {copied ? 'คัดลอกข้อความแล้ว' : 'คัดลอกข้อความ'}
            </Button>
            <button type="button" onClick={() => setTempPw('')} className="text-label font-medium text-warning underline">
              ซ่อน
            </button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState title="โหลดรายชื่อผู้ใช้ไม่สำเร็จ" onRetry={() => void refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className={cn(tableCls, 'min-w-[860px]')}>
              <thead>
                <tr>
                  <SortableTh label="อีเมล" active={sortKey === 'email'} dir={sortDir} onSort={() => onSort('email')} />
                  <SortableTh label="เวิร์กสเปซ · บทบาท" active={sortKey === 'tenant'} dir={sortDir} onSort={() => onSort('tenant')} />
                  <SortableTh label="สถานะ" active={sortKey === 'status'} dir={sortDir} onSort={() => onSort('status')} />
                  <Th align="right" className="w-80">
                    <span className="sr-only">จัดการ</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={6} cols={4} />
                ) : (
                  users.map((u) => (
                    <Row key={u.id}>
                      <Td>
                        <span className="font-semibold">{u.email}</span>
                        {u.mustChangePw && (
                          <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-label font-semibold text-warning">รอเปลี่ยนรหัส</span>
                        )}
                      </Td>
                      <Td>
                        {u.memberships.length === 0 ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {u.memberships.map((m) => (
                              <span key={m.tenantId} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-label text-ink-600">
                                <span className="font-mono">{m.tenantId}</span>
                                <span className="text-ink-400">·</span>
                                {ROLE_TH[m.role] ?? m.role}
                              </span>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-label font-semibold',
                            u.status === 'active' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                          )}
                        >
                          {u.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </Td>
                      <Td align="right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void reset(u)}>
                            <KeyRound size={14} /> ตั้งรหัสใหม่
                          </Button>
                          {u.status === 'active' ? (
                            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => setConfirm({ kind: 'disable', user: u })}>
                              <PowerOff size={14} /> ระงับ
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void actions.enable(u.id)}>
                              <Power size={14} /> เปิดใช้งาน
                            </Button>
                          )}
                          <Button variant="ghost" className="h-9 px-3 text-body" title="บังคับเปลี่ยนรหัส" onClick={() => setConfirm({ kind: 'force', user: u })}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" className="h-9 px-3 text-body" title="เพิกถอนเซสชัน" onClick={() => setConfirm({ kind: 'revoke', user: u })}>
                            <ShieldOff size={14} />
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && users.length === 0 && (
          <EmptyState icon={UserCog} title="ไม่พบผู้ใช้" description="ยังไม่มีผู้ใช้ หรือไม่ตรงกับคำค้นหา" />
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        tone={confirm?.kind === 'revoke' ? 'danger' : 'primary'}
        title={
          confirm?.kind === 'disable' ? 'ยืนยันการระงับผู้ใช้' : confirm?.kind === 'revoke' ? 'ยืนยันเพิกถอนเซสชัน' : 'ยืนยันบังคับเปลี่ยนรหัส'
        }
        message={
          confirm ? (
            <>
              ผู้ใช้ <b>{confirm.user.email}</b>{' '}
              {confirm.kind === 'disable' ? 'จะไม่สามารถเข้าสู่ระบบได้อีก' : confirm.kind === 'revoke' ? 'จะถูกออกจากระบบทุกอุปกรณ์ทันที' : 'จะต้องตั้งรหัสผ่านใหม่เมื่อเข้าใช้ครั้งถัดไป'}
            </>
          ) : (
            ''
          )
        }
        confirmLabel="ยืนยัน"
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
