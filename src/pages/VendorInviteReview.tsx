import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useVendorInvites, useReviewVendorInvite } from '../hooks/useVendorInvites'
import { INVITE_STATUS_LABEL } from '../lib/vendor-invite'
import { maskTaxId } from '../lib/taxid'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/input'
import { ErrorState } from '../components/ui/error-state'
import { Spinner } from '../components/ui/spinner'
import { useToast } from '../components/ui/toast'
import { VendorDocument } from '../components/vendors/vendor-document'

// Client-side review of a vendor's submitted onboarding data. Approving creates
// the vendor record; the warnings (duplicate tax ID, bank-name mismatch) are the
// safeguards that make self-submitted data trustworthy.

export function VendorInviteReview() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data, isLoading, isError, refetch } = useVendorInvites()
  const review = useReviewVendorInvite()
  const [note, setNote] = useState('')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-body text-ink-500">
        <Spinner /> กำลังโหลด…
      </div>
    )
  }
  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />
  }

  const inv = (data ?? []).find((x) => x.id === id)
  if (!inv) {
    return (
      <div className="space-y-3">
        <Link to="/vendors" className="text-body font-semibold text-ink-500">← กลับทะเบียนผู้ขาย</Link>
        <p>ไม่พบคำเชิญ</p>
      </div>
    )
  }

  const act = async (action: 'approve' | 'reject' | 'request-changes') => {
    try {
      const res = await review.mutateAsync({ id: inv.id, action, note: note.trim() || undefined })
      if (action === 'approve') {
        toast.show('อนุมัติผู้ขายแล้ว')
        nav(res.vendorId ? `/vendors/${res.vendorId}` : '/vendors')
      } else if (action === 'request-changes') {
        toast.show('ส่งคำขอแก้ไขให้ผู้ขายแล้ว')
      } else {
        toast.show('ปฏิเสธคำเชิญแล้ว')
        nav('/vendors')
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ', 'error')
    }
  }

  const d = inv.draft
  const taxId = d?.taxId ?? ''

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link to="/vendors" className="text-body font-semibold text-ink-500">← กลับทะเบียนผู้ขาย</Link>
      </div>
      <PageHeader title="ตรวจสอบข้อมูลผู้ขาย" sub={INVITE_STATUS_LABEL[inv.status]} />

      {!d ? (
        <Card><CardBody><p className="text-body text-ink-500">ผู้ขายยังไม่ได้ส่งข้อมูล</p></CardBody></Card>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-3">
              <Row label="ชื่อผู้ขาย" value={`${d.prefix} ${d.name}`.trim()} />
              <Row label="ที่อยู่" value={d.address} />
              <Row label="เลขบัตรประชาชน" value={maskTaxId(taxId.slice(-4))} mono />
              <Row label="ธนาคาร" value={d.bankName} />
              <Row label="เลขที่บัญชี" value={d.bankAccount} mono />
              <Row label="ชื่อบัญชี" value={d.accountHolder} />
              {d.phone && <Row label="โทรศัพท์" value={d.phone} />}
              {d.email && <Row label="อีเมล" value={d.email} />}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid grid-cols-2 gap-3">
              <VendorDocument owner={{ kind: 'invite', id: inv.id }} doc="id" label="บัตรประชาชน" hasDoc={!!inv.idDocName || !!inv.idDocData} />
              <VendorDocument owner={{ kind: 'invite', id: inv.id }} doc="bank" label="หน้าสมุดบัญชี" hasDoc={!!inv.bankDocName || !!inv.bankDocData} />
            </CardBody>
          </Card>

          {(inv.duplicateOf || inv.bankNameMatch === false) && (
            <div className="space-y-2 rounded-control bg-warning-soft p-3 text-body text-warning">
              {inv.duplicateOf && (
                <p className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>เลขบัตรประชาชนนี้มีผู้ขายอยู่แล้วในทะเบียน — ตรวจสอบว่าเป็นรายเดียวกันหรือไม่</span>
                </p>
              )}
              {inv.bankNameMatch === false && (
                <p className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>ชื่อบัญชีไม่ตรงกับชื่อผู้ขาย — โปรดตรวจสอบก่อนโอนเงิน</span>
                </p>
              )}
            </div>
          )}

          {inv.status === 'submitted' && (
            <>
              <div>
                <label className="mb-1.5 block text-label font-medium text-ink-600">หมายเหตุถึงผู้ขาย (ไม่บังคับ)</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="เช่น ขอสำเนาบัตรที่เห็นเลขชัดขึ้น" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void act('approve')} loading={review.isPending}>
                  <CheckCircle2 size={15} /> อนุมัติและสร้างผู้ขาย
                </Button>
                <Button variant="secondary" onClick={() => void act('request-changes')} loading={review.isPending}>
                  ขอให้แก้ไข
                </Button>
                <Button variant="ghost" onClick={() => void act('reject')} loading={review.isPending}>
                  ปฏิเสธ
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2">
      <span className="text-label text-ink-500">{label}</span>
      <span className={mono ? 'font-mono text-body' : 'text-body'}>{value}</span>
    </div>
  )
}
