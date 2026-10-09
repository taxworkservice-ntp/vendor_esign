import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, UserPlus } from 'lucide-react'
import { useVendorInvites } from '../../hooks/useVendorInvites'
import { inviteAttention } from '../../lib/vendor-invite'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'
import { CreateInviteDialog } from './create-invite-dialog'

// Compact invites summary for the supplier register: counts + the create action.
// The full list lives on /vendors/invites (a registry), so the register stays
// clean as invites accumulate.

export function VendorInvitesSummary() {
  const { data } = useVendorInvites()
  const [open, setOpen] = useState(false)
  const invites = data ?? []
  const submitted = invites.filter((i) => i.status === 'submitted').length
  const waiting = invites.filter((i) => i.status === 'invited' || i.status === 'opened').length
  const done = invites.filter((i) => ['approved', 'rejected', 'expired', 'changes_requested', 'cancelled'].includes(i.status)).length
  const followup = invites.filter((i) => inviteAttention(i).level === 'followup').length

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-title font-semibold">
            <UserPlus size={17} className="text-ink-500" aria-hidden /> เชิญผู้ขายกรอกข้อมูล
          </h2>
          <p className="mt-0.5 text-body text-ink-500">
            ส่งลิงก์ให้ผู้ขายกรอกข้อมูลและแนบเอกสารเอง — ลดการถามข้อมูลทางแชท
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label">
            {submitted > 0 ? (
              <Link to="/vendors/invites?status=submitted" className="font-semibold text-warning underline-offset-2 hover:underline">
                รอตรวจสอบ {submitted}
              </Link>
            ) : (
              <span className="text-ink-500">รอตรวจสอบ 0</span>
            )}
            {followup > 0 ? (
              <Link to="/vendors/invites?status=followup" className="font-semibold text-warning underline-offset-2 hover:underline">
                ต้องติดตาม {followup}
              </Link>
            ) : (
              <span className="text-ink-500">ต้องติดตาม 0</span>
            )}
            <span className="text-ink-500">กำลังรอผู้ขาย {waiting}</span>
            <span className="text-ink-500">เสร็จสิ้น {done}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {invites.length > 0 && (
            <Link to="/vendors/invites">
              <Button variant="secondary">
                ดูทั้งหมด <ChevronRight size={15} />
              </Button>
            </Link>
          )}
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> สร้างลิงก์เชิญ
          </Button>
        </div>
      </CardBody>
      <CreateInviteDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}
