import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'
import { FieldError, Input, Label } from '../ui/input'
import { Checkbox } from '../ui/checkbox'
import { PanelSkeleton } from '../ui/table-skeleton'
import { cn } from '../../lib/cn'
import { useResetPreview, useResetTenant, type ResetCounts } from '../../hooks/useAdmin'

// Operator "reset workspace to fresh" flow — for a client that finished a trial
// and wants to start over. Deliberately staged (review → confirm → done) and
// gated behind an impact preview + type-to-confirm, because it permanently
// deletes operational data. A client that already has real receipts should be
// suspended or voided instead; this is the trial escape hatch.

type Step = 'review' | 'confirm' | 'done'

const STEPS: { key: Step; label: string }[] = [
  { key: 'review', label: 'ตรวจสอบผลกระทบ' },
  { key: 'confirm', label: 'ยืนยัน' },
  { key: 'done', label: 'เสร็จสิ้น' },
]

const ERROR_TEXT: Record<string, string> = {
  'invalid-confirmation': 'พิมพ์รหัสลูกค้าไม่ตรงกับที่กำหนด',
  'too-many-requests': 'ทำรายการถี่เกินไป — กรุณารอสักครู่',
  'not-found': 'ไม่พบลูกค้ารายนี้',
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-card-border bg-white px-3.5 py-3">
      <p className="text-label text-ink-500">{label}</p>
      <p className={cn('text-title font-semibold tabular-nums', value > 0 ? 'text-ink-900' : 'text-ink-400')}>{value}</p>
    </div>
  )
}

export function ResetWorkspaceDialog({
  open,
  tenantId,
  onClose,
}: {
  open: boolean
  tenantId: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('review')
  const [typed, setTyped] = useState('')
  const [ack, setAck] = useState(false)
  const [resetSequences, setResetSequences] = useState(true)
  const [deleteFiles, setDeleteFiles] = useState(true)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)

  const preview = useResetPreview(tenantId, open && step === 'review')
  const reset = useResetTenant(tenantId)

  // Fresh state each time the wizard opens so a previous run never leaks in.
  useEffect(() => {
    if (!open) return
    setStep('review')
    setTyped('')
    setAck(false)
    setResetSequences(true)
    setDeleteFiles(true)
    setReason('')
    setError('')
  }, [open])

  // Move focus to the confirm field when the operator reaches that step.
  useEffect(() => {
    if (open && step === 'confirm') codeRef.current?.focus()
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !reset.isPending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, reset.isPending, onClose])

  const counts = preview.data?.counts
  const total = useMemo(
    () => (counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0),
    [counts],
  )

  const expected = (preview.data?.clientCode ?? tenantId).trim().toUpperCase()
  const codeMatches =
    typed.trim().toUpperCase() === expected || typed.trim().toUpperCase() === tenantId.trim().toUpperCase()
  const canSubmit = codeMatches && ack && !reset.isPending && !!preview.data

  if (!open) return null

  const runReset = async () => {
    setError('')
    try {
      await reset.mutateAsync({ confirmation: typed.trim(), resetSequences, deleteFiles, reason: reason.trim() })
      setStep('done')
    } catch (e) {
      const key = e instanceof Error ? e.message : ''
      setError(ERROR_TEXT[key] ?? 'ล้างข้อมูลไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const activeIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-workspace-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'confirm' && !reset.isPending) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-2xl">
        <CardBody className="space-y-5">
          {/* Header + stepper */}
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-control bg-warning-soft text-warning">
              <RotateCcw size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="reset-workspace-title" className="text-title font-semibold">ล้างข้อมูลเริ่มใหม่</h2>
              <p className="text-body text-ink-500">
                {preview.data ? `${preview.data.clientCode} · ${preview.data.displayName}` : 'กำลังโหลด…'}
              </p>
            </div>
          </div>

          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-label font-semibold',
                    i < activeIndex ? 'bg-success-soft text-success'
                      : i === activeIndex ? 'bg-primary text-white'
                        : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {i < activeIndex ? <Check size={13} aria-hidden /> : i + 1}
                </span>
                <span className={cn('text-label', i === activeIndex ? 'font-semibold text-ink-900' : 'text-ink-500')}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-card-border" aria-hidden />}
              </li>
            ))}
          </ol>

          {step === 'review' && (
            <div className="space-y-4">
              {preview.isLoading || !counts ? (
                <PanelSkeleton rows={3} cols={3} />
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-label font-medium text-ink-600">ข้อมูลที่จะถูกลบถาวร</p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <Counter label="ธุรกรรม" value={counts.txns} />
                      <Counter label="ใบเสร็จ" value={counts.receipts} />
                      <Counter label="การลงนาม" value={counts.signings} />
                      <Counter label="ผู้ขาย" value={counts.vendors} />
                      <Counter label="ภาษีหัก ณ ที่จ่าย" value={counts.wht} />
                      <Counter label="WHT vendors" value={counts.whtVendors} />
                      <Counter label="คำเชิญผู้ขาย" value={counts.invites} />
                      <Counter label="สินค้า" value={counts.items} />
                      <Counter label="รายการในเอกสาร" value={counts.lineItems} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-control border border-card-border bg-success-soft/50 p-3.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-success">
                        <ShieldCheck size={14} aria-hidden /> เก็บไว้
                      </p>
                      <ul className="space-y-1 text-body text-ink-700">
                        <li>ผู้ใช้ {preview.data?.users ?? 0} คน และรหัสผ่านเดิม</li>
                        <li>โปรไฟล์บริษัท · ที่อยู่ · เลขภาษี</li>
                        <li>การตั้งค่า (WHT · ข้อความยินยอม)</li>
                        <li>ประวัติการใช้งาน (audit)</li>
                      </ul>
                    </div>
                    <div className="rounded-control border border-danger/30 bg-danger-soft/60 p-3.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-danger">
                        <Trash2 size={14} aria-hidden /> จะถูกลบ
                      </p>
                      <ul className="space-y-1 text-body text-ink-700">
                        <li>ข้อมูลทดลองทั้งหมด ({total} รายการ)</li>
                        <li>ไฟล์แนบ สลิป ลายเซ็น PDF</li>
                        <li>ลิงก์ลงนามและเซสชันที่ค้างอยู่</li>
                        <li>เลขที่เอกสารกลับไปเริ่มที่ {preview.data?.startNumber ?? 1}</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-control border border-danger/30 bg-danger-soft p-3.5 text-body text-danger">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <p>ดำเนินการนี้ย้อนกลับไม่ได้ — ใช้เฉพาะลูกค้าที่จบการทดลองและต้องการเริ่มใหม่ หากมีใบเสร็จจริงแล้วให้ใช้ “ระงับ” แทน</p>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-control border border-card-border bg-ink-50/80 p-3.5">
                <p className="text-body text-ink-700">
                  ลบ <strong className="font-semibold text-ink-900">{total} รายการ</strong> และรีเซ็ตเลขที่เอกสารของ{' '}
                  <strong className="font-semibold text-ink-900">{preview.data?.clientCode}</strong> กลับไปเริ่มที่{' '}
                  <strong className="font-semibold text-ink-900">{preview.data?.startNumber}</strong>
                </p>
              </div>

              <div>
                <label htmlFor="reset-confirm-code" className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-label font-medium text-ink-600">
                    พิมพ์ <span className="font-mono font-semibold">{preview.data?.clientCode}</span> เพื่อยืนยัน
                    <span className="ml-0.5 text-danger" aria-hidden="true">*</span>
                  </span>
                </label>
                <Input
                  id="reset-confirm-code"
                  ref={codeRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={preview.data?.clientCode}
                  autoComplete="off"
                  spellCheck={false}
                  invalid={typed.length > 0 && !codeMatches}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2.5">
                <Checkbox
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  label="ฉันเข้าใจว่าข้อมูลทดลองจะถูกลบถาวรและกู้คืนไม่ได้"
                />
                <Checkbox
                  checked={resetSequences}
                  onChange={(e) => setResetSequences(e.target.checked)}
                  label="รีเซ็ตเลขที่เอกสารกลับไปเริ่มที่ค่าเริ่มต้น"
                />
                <Checkbox
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                  label="ลบไฟล์แนบที่จัดเก็บไว้ด้วย"
                />
              </div>

              <div>
                <Label htmlFor="reset-reason" hint="ไม่บังคับ">
                  เหตุผล (บันทึกในประวัติ)
                </Label>
                <Input
                  id="reset-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น ลูกค้าจบการทดลองและขอเริ่มใหม่"
                  maxLength={280}
                  autoComplete="off"
                />
              </div>

              <FieldError msg={error} />
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-control border border-success/30 bg-success-soft p-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success-fill text-white">
                  <Check size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-title font-semibold text-success">ล้างข้อมูลเรียบร้อย</p>
                  <p className="text-body text-ink-700">เวิร์กสเปซพร้อมเริ่มใช้งานใหม่ — ผู้ใช้และข้อมูลบริษัทยังอยู่ครบ</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Counter label="ลบธุรกรรม" value={reset.data?.deleted.txns ?? 0} />
                <Counter label="ลบใบเสร็จ" value={reset.data?.deleted.receipts ?? 0} />
                <Counter label="ลบผู้ขาย" value={reset.data?.deleted.vendors ?? 0} />
              </div>

              <div className="rounded-control border border-card-border bg-ink-50/80 p-3.5 text-body">
                {reset.data?.resetSequences ? (
                  <p className="text-ink-700">
                    เลขที่ใบเสร็จของผู้ขายแต่ละรายจะเริ่มนับใหม่ที่เลข{' '}
                    <strong className="font-semibold text-ink-900">{preview.data?.startNumber ?? 1}</strong> (ปี {preview.data?.beYear})
                  </p>
                ) : (
                  <p className="text-ink-700">เลือกไม่รีเซ็ตเลขที่ — เลขจะเดินต่อจากเดิม</p>
                )}
                {reset.data?.deleteFiles && (
                  <p className="mt-1 text-ink-500">ลบไฟล์แนบแล้ว {reset.data.filesDeleted} ไฟล์</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-card-border pt-4">
            {step === 'review' && (
              <>
                <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
                <Button variant="primary" disabled={!counts} onClick={() => setStep('confirm')}>
                  ดำเนินการต่อ
                </Button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <Button variant="ghost" disabled={reset.isPending} onClick={() => setStep('review')}>ย้อนกลับ</Button>
                <Button variant="danger" loading={reset.isPending} disabled={!canSubmit} onClick={() => void runReset()}>
                  ล้างข้อมูล {total} รายการ
                </Button>
              </>
            )}
            {step === 'done' && (
              <Button variant="primary" onClick={onClose}>เสร็จสิ้น</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
