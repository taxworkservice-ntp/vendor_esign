import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Ban, Check, Copy, FileSearch, Plus, RotateCcw, Search, TriangleAlert, User } from 'lucide-react'
import { useCancelVendorInvite, useResendVendorInvite, useVendorInvites } from '../hooks/useVendorInvites'
import { useSettings } from '../hooks/useSettings'
import { inviteUrl } from '../lib/vendor-invite-source'
import { INVITE_STATUS_LABEL, inviteAttention, type VendorInvite, type VendorInviteStatus } from '../lib/vendor-invite'
import { renderVendorInviteMessage } from '../lib/settings'
import { fmtDateTH } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { TableSkeleton } from '../components/ui/table-skeleton'
import { FilterChip } from '../components/ui/filter-chip'
import { Pagination } from '../components/ui/pagination'
import { ClickableRow, Td, Th, tableCls } from '../components/ui/data-table'
import { CreateInviteDialog } from '../components/vendors/create-invite-dialog'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { useToast } from '../components/ui/toast'
import { cn } from '../lib/cn'

// Invite registry: search + status filter + pagination, like the other
// registers. The Vendors page keeps a compact summary that links here.

type Group = 'all' | 'submitted' | 'followup' | 'waiting' | 'done'

const GROUP_OF: Record<VendorInviteStatus, Group> = {
  submitted: 'submitted',
  invited: 'waiting',
  opened: 'waiting',
  approved: 'done',
  rejected: 'done',
  expired: 'done',
  changes_requested: 'done',
  cancelled: 'done',
}

const CHIPS: { key: Group; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'submitted', label: 'รอตรวจสอบ' },
  { key: 'followup', label: 'ต้องติดตาม' },
  { key: 'waiting', label: 'กำลังรอผู้ขาย' },
  { key: 'done', label: 'เสร็จสิ้น' },
]

const PAGE_SIZE = 20

const isFollowup = (inv: VendorInvite) => inviteAttention(inv).level === 'followup'
// Invites the client may close (never answered / needs rework / lapsed).
const CAN_CANCEL: VendorInviteStatus[] = ['invited', 'opened', 'expired', 'changes_requested']

function inviteName(inv: VendorInvite): string {
  return inv.draft ? `${inv.draft.prefix} ${inv.draft.name}`.trim() : inv.label || 'ลิงก์เชิญผู้ขาย'
}

const STATUS_TONE: Record<VendorInviteStatus, string> = {
  invited: 'bg-ink-100 text-ink-600',
  opened: 'bg-ink-100 text-ink-600',
  submitted: 'bg-warning-soft text-warning',
  approved: 'bg-success-soft text-success',
  changes_requested: 'bg-warning-soft text-warning',
  rejected: 'bg-ink-100 text-ink-500',
  expired: 'bg-ink-100 text-ink-400',
  cancelled: 'bg-ink-100 text-ink-400',
}

function InviteStatusBadge({ status }: { status: VendorInviteStatus }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-label font-medium', STATUS_TONE[status])}>
      {INVITE_STATUS_LABEL[status]}
    </span>
  )
}

// Icon-only row action — the same treatment the supplier register uses, so the
// column stays narrow and labels never wrap.
function IconAction({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40',
        danger && 'hover:bg-danger-soft hover:text-danger',
      )}
    >
      {children}
    </button>
  )
}

export function VendorInvitesList() {
  const [params, setParams] = useSearchParams()
  const initial = (params.get('status') as Group | null) ?? 'all'
  const [group, setGroup] = useState<Group>(CHIPS.some((c) => c.key === initial) ? initial : 'all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [createOpen, setCreateOpen] = useState(false)
  const [fresh, setFresh] = useState<VendorInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<VendorInvite | null>(null)
  const { data, isLoading, isError, refetch } = useVendorInvites()
  const resend = useResendVendorInvite()
  const cancel = useCancelVendorInvite()
  const { data: settings } = useSettings()
  const toast = useToast()
  const nav = useNavigate()

  const invites = useMemo(() => data ?? [], [data])
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: invites.length, submitted: 0, followup: 0, waiting: 0, done: 0 }
    for (const i of invites) {
      c[GROUP_OF[i.status]]++
      if (isFollowup(i)) c.followup++
    }
    return c
  }, [invites])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return invites
      .filter((i) => (group === 'all' ? true : group === 'followup' ? isFollowup(i) : GROUP_OF[i.status] === group))
      .filter((i) => (needle ? inviteName(i).toLowerCase().includes(needle) : true))
  }, [invites, group, search])

  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)

  const pick = (g: Group) => {
    setGroup(g)
    setPage(0)
    const next = new URLSearchParams(params)
    if (g === 'all') next.delete('status')
    else next.set('status', g)
    setParams(next, { replace: true })
  }

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopied(true)
      toast.show('คัดลอกลิงก์แล้ว')
    } catch {
      toast.show('คัดลอกไม่สำเร็จ', 'error')
    }
  }

  const copyMessage = async (token: string) => {
    const msg = renderVendorInviteMessage(settings?.vendorInviteMessageTemplate ?? '', {
      client: settings?.displayName ?? '',
      link: inviteUrl(token),
    })
    try {
      await navigator.clipboard.writeText(msg)
      toast.show('คัดลอกข้อความแล้ว')
    } catch {
      toast.show('คัดลอกไม่สำเร็จ', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="คำเชิญผู้ขาย"
        sub="ลิงก์ให้ผู้ขายกรอกข้อมูลและแนบเอกสารเอง — ตรวจสอบและอนุมัติก่อนใช้ในรายการ"
        breadcrumb={[{ to: '/vendors', label: 'ผู้ขาย' }, { label: 'คำเชิญผู้ขาย' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> สร้างลิงก์เชิญ
          </Button>
        }
      />

      {fresh?.token && (
        <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
          <p className="font-semibold">ลิงก์เชิญใหม่ (ส่งให้ผู้ขาย)</p>
          <p className="mt-1 break-all font-mono text-label">{inviteUrl(fresh.token)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void copyLink(fresh.token as string)}>
              {copied ? <Check size={14} /> : <Copy size={14} />} คัดลอกลิงก์
            </Button>
            <Button variant="ghost" className="h-9 px-3 text-body" onClick={() => void copyMessage(fresh.token as string)}>
              <Copy size={14} /> คัดลอกข้อความ
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="relative">
            <label htmlFor="invite-search" className="sr-only">ค้นหาคำเชิญ</label>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              id="invite-search"
              className="pl-10"
              placeholder="ค้นหาชื่อผู้ขาย หรือบันทึกช่วยจำ…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CHIPS.map((c) => (
              <FilterChip key={c.key} active={group === c.key} onClick={() => pick(c.key)}>
                {c.label}
                {counts[c.key] > 0 && <span className="tabular-nums opacity-70">{counts[c.key]}</span>}
              </FilterChip>
            ))}
            <span className="ml-auto text-label text-ink-500">{isLoading ? 'กำลังโหลด…' : `${filtered.length.toLocaleString('th-TH')} รายการ`}</span>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState title="โหลดคำเชิญไม่สำเร็จ" onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={cn(tableCls, 'min-w-[760px]')}>
                <thead>
                  <tr>
                    <Th>ผู้ขาย / บันทึก</Th>
                    <Th>สถานะ</Th>
                    <Th>สร้างเมื่อ</Th>
                    <Th>หมดอายุ</Th>
                    <Th align="right" className="w-28 whitespace-nowrap"><span className="sr-only">จัดการ</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <TableSkeleton rows={6} cols={5} />
                  ) : (
                    pageRows.map((inv) => (
                      <ClickableRow
                        key={inv.id}
                        label={`เปิดคำเชิญ ${inviteName(inv)}`}
                        onOpen={() => nav(`/vendors/invites/${inv.id}`)}
                      >
                        <Td>
                          <p className="truncate font-semibold">{inviteName(inv)}</p>
                          {inv.label && inv.draft && <p className="text-label text-ink-500">{inv.label}</p>}
                          {isFollowup(inv) && (
                            <p className="mt-0.5 flex items-center gap-1 text-label text-warning">
                              <TriangleAlert size={12} aria-hidden /> {inviteAttention(inv).reason} · {inviteAttention(inv).ageDays} วัน
                            </p>
                          )}
                        </Td>
                        <Td><InviteStatusBadge status={inv.status} /></Td>
                        <Td className="whitespace-nowrap text-ink-600">{fmtDateTH(inv.createdAt)}</Td>
                        <Td className="whitespace-nowrap text-ink-500">{fmtDateTH(inv.expiresAt)}</Td>
                        <Td className="px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {inv.status === 'submitted' && (
                              <IconAction label={`ตรวจสอบ ${inviteName(inv)}`} onClick={() => nav(`/vendors/invites/${inv.id}`)}>
                                <FileSearch size={16} aria-hidden />
                              </IconAction>
                            )}
                            {['invited', 'opened', 'expired', 'changes_requested'].includes(inv.status) && (
                              <IconAction
                                label="สร้างลิงก์ใหม่"
                                disabled={resend.isPending}
                                onClick={() =>
                                  resend.mutate(inv.id, {
                                    onSuccess: (r) => { setFresh(r); setCopied(false) },
                                    onError: () => toast.show('สร้างลิงก์ใหม่ไม่สำเร็จ', 'error'),
                                  })
                                }
                              >
                                <RotateCcw size={16} aria-hidden />
                              </IconAction>
                            )}
                            {inv.status === 'approved' && inv.vendorId && (
                              <IconAction label="ดูผู้ขาย" onClick={() => nav(`/vendors/${inv.vendorId}`)}>
                                <User size={16} aria-hidden />
                              </IconAction>
                            )}
                            {CAN_CANCEL.includes(inv.status) && (
                              <IconAction label="ยกเลิกคำเชิญ" danger onClick={() => setCancelTarget(inv)}>
                                <Ban size={16} aria-hidden />
                              </IconAction>
                            )}
                          </div>
                        </Td>
                      </ClickableRow>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!isLoading && filtered.length === 0 && (
              <EmptyState
                icon={Search}
                title={search.trim() ? 'ไม่พบคำเชิญที่ค้นหา' : 'ยังไม่มีคำเชิญ'}
                description={search.trim() ? 'ลองค้นด้วยชื่อผู้ขายหรือบันทึกช่วยจำ' : 'กด “สร้างลิงก์เชิญ” เพื่อส่งให้ผู้ขายกรอกข้อมูล'}
              />
            )}

            {!isLoading && filtered.length > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPage={setPage}
                onPageSize={(s) => { setPageSize(s); setPage(0) }}
              />
            )}
          </>
        )}
      </Card>

      <p className="text-label text-ink-500">
        ผู้ขายไม่ตอบ? ส่งลิงก์อีกครั้งด้านบน หรือ{' '}
        <Link to="/vendors/new" className="font-medium text-primary-text hover:underline">สร้างผู้ขายเอง</Link>
      </p>

      <ConfirmDialog
        open={!!cancelTarget}
        tone="danger"
        title="ยกเลิกคำเชิญนี้?"
        message={<>ลิงก์เชิญของ <b>{cancelTarget ? inviteName(cancelTarget) : ''}</b> จะถูกปิดและใช้งานไม่ได้อีก</>}
        confirmLabel="ยกเลิกคำเชิญ"
        cancelLabel="ปิด"
        busy={cancel.isPending}
        onConfirm={() => {
          if (!cancelTarget) return
          cancel.mutate(cancelTarget.id, {
            onSuccess: () => { toast.show('ยกเลิกคำเชิญแล้ว'); setCancelTarget(null) },
            onError: (e) => toast.show(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error'),
          })
        }}
        onCancel={() => setCancelTarget(null)}
      />

      <CreateInviteDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
