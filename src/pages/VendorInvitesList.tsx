import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Copy, Plus, RotateCcw, Search } from 'lucide-react'
import { useResendVendorInvite, useVendorInvites } from '../hooks/useVendorInvites'
import { inviteUrl } from '../lib/vendor-invite-source'
import { INVITE_STATUS_LABEL, type VendorInvite, type VendorInviteStatus } from '../lib/vendor-invite'
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
import { Td, Th, tableCls } from '../components/ui/data-table'
import { CreateInviteDialog } from '../components/vendors/create-invite-dialog'
import { useToast } from '../components/ui/toast'
import { cn } from '../lib/cn'

// Invite registry: search + status filter + pagination, like the other
// registers. The Vendors page keeps a compact summary that links here.

type Group = 'all' | 'submitted' | 'waiting' | 'done'

const GROUP_OF: Record<VendorInviteStatus, Group> = {
  submitted: 'submitted',
  invited: 'waiting',
  opened: 'waiting',
  approved: 'done',
  rejected: 'done',
  expired: 'done',
  changes_requested: 'done',
}

const CHIPS: { key: Group; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'submitted', label: 'รอตรวจสอบ' },
  { key: 'waiting', label: 'กำลังรอผู้ขาย' },
  { key: 'done', label: 'เสร็จสิ้น' },
]

const PAGE_SIZE = 20

function inviteName(inv: VendorInvite): string {
  return inv.draft ? `${inv.draft.prefix} ${inv.draft.name}`.trim() : inv.label || 'ลิงก์เชิญผู้ขาย'
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
  const { data, isLoading, isError, refetch } = useVendorInvites()
  const resend = useResendVendorInvite()
  const toast = useToast()

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data ?? [])
      .filter((i) => (group === 'all' ? true : GROUP_OF[i.status] === group))
      .filter((i) => (needle ? inviteName(i).toLowerCase().includes(needle) : true))
  }, [data, group, search])

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="คำเชิญผู้ขาย"
        sub="ลิงก์ให้ผู้ขายกรอกข้อมูลและแนบเอกสารเอง — ตรวจสอบและอนุมัติก่อนใช้ในรายการ"
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
          <div className="mt-2">
            <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void copyLink(fresh.token as string)}>
              {copied ? <Check size={14} /> : <Copy size={14} />} คัดลอกลิงก์
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
                    <Th align="right" className="w-40"><span className="sr-only">จัดการ</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <TableSkeleton rows={6} cols={5} />
                  ) : (
                    pageRows.map((inv) => (
                      <tr key={inv.id} className="border-b border-card-border last:border-0">
                        <Td>
                          <p className="truncate font-semibold">{inviteName(inv)}</p>
                          {inv.label && inv.draft && <p className="text-label text-ink-500">{inv.label}</p>}
                        </Td>
                        <Td>
                          <span className={cn('text-body', inv.status === 'submitted' ? 'font-semibold text-warning' : 'text-ink-600')}>
                            {INVITE_STATUS_LABEL[inv.status]}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-ink-600">{fmtDateTH(inv.createdAt)}</Td>
                        <Td className="whitespace-nowrap text-ink-500">{fmtDateTH(inv.expiresAt)}</Td>
                        <Td className="px-2">
                          <div className="flex items-center justify-end gap-1">
                            {inv.status === 'submitted' && (
                              <Link to={`/vendors/invites/${inv.id}`}>
                                <Button variant="secondary" className="h-9 px-3 text-body">ตรวจสอบ</Button>
                              </Link>
                            )}
                            {['invited', 'opened', 'expired', 'changes_requested'].includes(inv.status) && (
                              <Button
                                variant="ghost"
                                className="h-9 px-3 text-body"
                                loading={resend.isPending}
                                onClick={() =>
                                  resend.mutate(inv.id, {
                                    onSuccess: (r) => { setFresh(r); setCopied(false) },
                                    onError: () => toast.show('สร้างลิงก์ใหม่ไม่สำเร็จ', 'error'),
                                  })
                                }
                              >
                                <RotateCcw size={14} /> ลิงก์ใหม่
                              </Button>
                            )}
                            {inv.status === 'approved' && inv.vendorId && (
                              <Link to={`/vendors/${inv.vendorId}`} className="text-body font-medium text-primary-text hover:underline">
                                ดูผู้ขาย
                              </Link>
                            )}
                          </div>
                        </Td>
                      </tr>
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

      <CreateInviteDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
