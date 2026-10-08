import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Link2, Plus, RotateCcw } from 'lucide-react'
import { useCreateVendorInvite, useResendVendorInvite, useVendorInvites } from '../../hooks/useVendorInvites'
import { inviteUrl } from '../../lib/vendor-invite-source'
import { INVITE_STATUS_LABEL, type VendorInvite } from '../../lib/vendor-invite'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'
import { useToast } from '../ui/toast'
import { cn } from '../../lib/cn'

// Vendor self-onboarding: create an invite link, copy a ready message, and track
// submitted invites awaiting review. Kept as its own panel so the supplier
// register stays untouched apart from one include.

function messageFor(url: string): string {
  return `สวัสดีครับ/ค่ะ ขอความร่วมมือกรอกข้อมูลผู้ขายเพื่อออกใบเสร็จและโอนเงิน ผ่านลิงก์นี้:\n${url}\n(ใช้เวลาประมาณ 2–3 นาที)`
}

export function VendorInvitesPanel() {
  const { data, isLoading } = useVendorInvites()
  const create = useCreateVendorInvite()
  const resend = useResendVendorInvite()
  const toast = useToast()
  const [fresh, setFresh] = useState<VendorInvite | null>(null)
  const [copied, setCopied] = useState(false)

  const invites = data ?? []
  const pending = invites.filter((i) => i.status === 'submitted').length

  const showFresh = (inv: VendorInvite) => {
    setFresh(inv)
    setCopied(false)
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.show('คัดลอกลิงก์แล้ว')
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-title font-semibold">เชิญผู้ขายกรอกข้อมูล</h2>
            <p className="text-body text-ink-500">
              ส่งลิงก์ให้ผู้ขายกรอกชื่อ ที่อยู่ เลขบัตรประชาชน บัญชีธนาคาร และแนบเอกสารเอง — ลดการถามข้อมูลทางแชท
            </p>
          </div>
          <Button
            variant="secondary"
            loading={create.isPending}
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (inv) => showFresh(inv),
                onError: () => toast.show('สร้างลิงก์ไม่สำเร็จ', 'error'),
              })
            }
          >
            <Plus size={16} /> สร้างลิงก์เชิญ
          </Button>
        </div>

        {fresh?.token && (
          <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
            <p className="font-semibold">ลิงก์เชิญ (ส่งให้ผู้ขาย)</p>
            <p className="mt-1 break-all font-mono text-label">{inviteUrl(fresh.token)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" className="h-9 px-3 text-body" onClick={() => void copy(inviteUrl(fresh.token as string))}>
                <Copy size={14} /> คัดลอกลิงก์
              </Button>
              <Button variant="ghost" className="h-9 px-3 text-body" onClick={() => void copy(messageFor(inviteUrl(fresh.token as string)))}>
                {copied ? <Check size={14} /> : <Copy size={14} />} คัดลอกข้อความ
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-body text-ink-500">กำลังโหลด…</p>
        ) : invites.length === 0 ? (
          <p className="text-body text-ink-500">ยังไม่มีคำเชิญ — กด “สร้างลิงก์เชิญ” เพื่อเริ่ม</p>
        ) : (
          <ul className="divide-y divide-card-border">
            {pending > 0 && (
              <li className="pb-1 text-label font-medium text-warning">
                มี {pending} รายการรอตรวจสอบ
              </li>
            )}
            {invites.slice(0, 20).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">
                    {inv.draft ? `${inv.draft.prefix} ${inv.draft.name}`.trim() : inv.label || 'ลิงก์เชิญผู้ขาย'}
                  </p>
                  <p className={cn('text-label', inv.status === 'submitted' ? 'text-warning' : 'text-ink-500')}>
                    {INVITE_STATUS_LABEL[inv.status]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {inv.status === 'submitted' && (
                    <Link to={`/vendors/invites/${inv.id}`}>
                      <Button variant="secondary" className="h-9 px-3 text-body">
                        ตรวจสอบ
                      </Button>
                    </Link>
                  )}
                  {['invited', 'opened', 'expired', 'changes_requested'].includes(inv.status) && (
                    <Button
                      variant="ghost"
                      className="h-9 px-3 text-body"
                      loading={resend.isPending}
                      onClick={() =>
                        resend.mutate(inv.id, {
                          onSuccess: (r) => showFresh(r),
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
              </li>
            ))}
          </ul>
        )}

        {invites.length > 0 && (
          <p className="flex items-center gap-1.5 text-label text-ink-400">
            <Link2 size={13} aria-hidden /> ลิงก์มีอายุ 30 วัน — สร้างใหม่ได้หากหมดอายุ
          </p>
        )}
      </CardBody>
    </Card>
  )
}
