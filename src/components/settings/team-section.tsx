import { useState } from 'react'
import { useTeamMembers, useUpdateMemberPermissions, type TeamMember } from '../../hooks/useTeam'
import {
  PERMISSION_KEYS,
  PERMISSION_META,
  type PermissionGroup,
  type PermissionKey,
  type Permissions,
} from '../../lib/permissions'
import { useClientAuth } from '../../lib/client-auth'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { ErrorState } from '../ui/error-state'
import { FieldError } from '../ui/input'
import { PanelSkeleton } from '../ui/table-skeleton'
import { useToast } from '../ui/toast'
import { cn } from '../../lib/cn'

// Owner self-service: permission flags for manager/officer members. Identity
// (invite, roles, disable) stays operator-owned, so this section offers no
// control for it — owners, yourself, and disabled-member toggles render
// locked, and invites go through the provider.

const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', officer: 'เจ้าหน้าที่' }

const GROUP_TH: Record<PermissionGroup, string> = {
  daily: 'งานประจำ',
  finance: 'การเงินและตั้งค่า',
  danger: 'การกระทำอันตราย',
}

const GROUP_ORDER: PermissionGroup[] = ['daily', 'finance', 'danger']

const ERROR_TH: Record<string, string> = {
  forbidden: 'เฉพาะเจ้าของบัญชีจัดการสิทธิ์ทีมได้',
  'forbidden-self': 'ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้',
  'forbidden-role': 'แก้ไขสิทธิ์ได้เฉพาะผู้จัดการและเจ้าหน้าที่',
  'not-found': 'ไม่พบสมาชิกท่านนี้ — ลองรีเฟรชแล้วทำใหม่',
  'invalid-body': 'ข้อมูลไม่ถูกต้อง โปรดลองอีกครั้ง',
}

function sameFlags(a: Permissions, b: Permissions): boolean {
  return PERMISSION_KEYS.every((k) => !!a[k] === !!b[k])
}

function MemberRow({
  member,
  isSelf,
  draft,
  onToggle,
  onSave,
  saving,
  error,
}: {
  member: TeamMember
  isSelf: boolean
  draft: Permissions
  onToggle: (key: PermissionKey) => void
  onSave: () => void
  saving: boolean
  error: string
}) {
  const locked = member.role === 'owner' || isSelf
  const dirty = !sameFlags(draft, member.permissions)
  return (
    <div className={cn('rounded-control border border-card-border p-3.5', member.status !== 'active' && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{member.email}</p>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-label font-semibold text-ink-700">
          {ROLE_TH[member.role] ?? member.role}
        </span>
        {isSelf && (
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-label font-semibold text-primary-text">คุณ</span>
        )}
        {member.role === 'owner' && !isSelf && (
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-label font-semibold text-success">สิทธิ์เต็ม</span>
        )}
        {member.mustChangePw && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-label font-semibold text-warning">รอเปลี่ยนรหัส</span>
        )}
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-label font-semibold',
            member.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink-100 text-ink-500',
          )}
        >
          {member.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </span>
      </div>

      {locked ? (
        <p className="mt-2 text-body text-ink-500">
          {isSelf ? 'ป้องกันการล็อกตัวเอง — จัดการสมาชิกท่านอื่นได้ตามปกติ' : 'เจ้าของบัญชีมีสิทธิ์เต็มโดยอัตโนมัติ แก้ไขไม่ได้'}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {GROUP_ORDER.map((group) => (
            <div key={group}>
              <p className={cn('mb-1.5 text-label font-semibold', group === 'danger' ? 'text-danger' : 'text-ink-500')}>
                {GROUP_TH[group]}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERMISSION_KEYS.filter((k) => PERMISSION_META[k].group === group).map((key) => (
                  <div key={key}>
                    <Checkbox
                      checked={!!draft[key]}
                      onChange={(e) => onToggle(key)}
                      label={PERMISSION_META[key].label}
                    />
                    <p className="ml-6 text-label text-ink-500">{PERMISSION_META[key].desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <FieldError msg={error} />
          <div className="flex justify-end">
            <Button variant="secondary" className="h-9 px-3.5 text-body" loading={saving} disabled={!dirty} onClick={onSave}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TeamSection() {
  const { email: myEmail } = useClientAuth()
  const { data: members, isLoading, isError, refetch } = useTeamMembers()
  const save = useUpdateMemberPermissions()
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, Permissions>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  if (isLoading) return <PanelSkeleton rows={3} cols={1} />
  if (isError || !members) return <ErrorState onRetry={() => void refetch()} />

  const toggle = (id: string, base: Permissions, key: PermissionKey) => {
    const cur = drafts[id] ?? base
    setDrafts({ ...drafts, [id]: { ...cur, [key]: !cur[key] } })
  }

  const runSave = async (m: TeamMember) => {
    const draft = drafts[m.id] ?? m.permissions
    setErrors({ ...errors, [m.id]: '' })
    setSavingId(m.id)
    try {
      await save.mutateAsync({ userId: m.id, permissions: draft })
      setDrafts(({ [m.id]: _dropped, ...rest }) => rest)
      toast.show(`บันทึกสิทธิ์ของ ${m.email} แล้ว`)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      setErrors({ ...errors, [m.id]: ERROR_TH[code] ?? 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <MemberRow
          key={m.id}
          member={m}
          isSelf={!!myEmail && m.email.toLowerCase() === myEmail.toLowerCase()}
          draft={drafts[m.id] ?? m.permissions}
          onToggle={(key) => toggle(m.id, m.permissions, key)}
          onSave={() => void runSave(m)}
          saving={savingId === m.id}
          error={errors[m.id] ?? ''}
        />
      ))}
      <p className="text-label leading-relaxed text-ink-500">
        ต้องการเชิญสมาชิกใหม่ เปลี่ยนบทบาท หรือปิดใช้งานบัญชี — ติดต่อผู้ให้บริการ (เจ้าของบัญชีจัดการได้เฉพาะสิทธิ์เท่านั้น)
      </p>
    </div>
  )
}
