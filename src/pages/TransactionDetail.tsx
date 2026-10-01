import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FileSearch, Link2, RotateCcw, ShieldAlert, UploadCloud } from 'lucide-react'
import { useTransaction, useTransactionActions } from '../hooks/useTransactions'
import { useSettings } from '../hooks/useSettings'
import { useReceiptAuthorization } from '../hooks/useReceiptAuthorization'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label, Textarea } from '../components/ui/input'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { PanelSkeleton } from '../components/ui/table-skeleton'
import { defaultSettings, renderInviteMessage } from '../lib/settings'
import { itemsTotal, normalizeLineItem } from '../lib/line-items'
import { vendorDisplayName } from '../lib/vendor-name'
import { fmtTHB, fmtDateTH } from '../lib/format'

export function TransactionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: t, isLoading, isError, error, refetch } = useTransaction(id)
  const acts = useTransactionActions()
  const { data: settings } = useSettings()
  const [voidReason, setVoidReason] = useState('')
  const [showVoid, setShowVoid] = useState(false)
  const [copiedKind, setCopiedKind] = useState<'' | 'link' | 'message'>('')
  const [editedMessage, setEditedMessage] = useState<string | null>(null)
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [slipRef, setSlipRef] = useState('')
  const [slipName, setSlipName] = useState('')
  const [slipErr, setSlipErr] = useState('')
  const [slipBusy, setSlipBusy] = useState(false)

  // Corrections come from the authorization record. They used to be read from
  // mock-only storage, so on the server path a vendor who corrected the client's
  // spelling was never told — the diff is now derived server-side.
  //
  // This hook is ABOVE the loading/error/not-found returns on purpose. It used to
  // sit just below them, which made the page a rules-of-hooks violation: the
  // loading render called 41 hooks and the loaded render called 42, so React threw
  // "Rendered more hooks than during the previous render" and the error boundary
  // swallowed the whole page — the one page a bookkeeper opens to check a
  // signature. Optional chaining means it safely receives undefined while loading
  // and stays disabled.
  const { data: auth } = useReceiptAuthorization(t?.id)
  const corrections = auth?.corrections ?? []

  // Loading, failure and not-found are three different things. Collapsing them
  // into "ไม่พบรายการ" told the user a record did not exist when in fact the
  // request had failed or was still in flight.
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-body font-medium text-ink-500">← กลับรายการ</Link>
        <Card>
          <CardBody>
            <PanelSkeleton rows={6} cols={2} />
          </CardBody>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-body font-medium text-ink-500">← กลับรายการ</Link>
        <Card>
          <ErrorState
            title="โหลดรายการไม่สำเร็จ"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        </Card>
      </div>
    )
  }

  if (!t) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-body font-medium text-ink-500">← กลับรายการ</Link>
        <Card>
          <EmptyState
            icon={FileSearch}
            title="ไม่พบรายการ"
            description={id ? `ไม่มีรายการที่มีรหัส ${id} — อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง` : 'ไม่พบรหัสรายการในลิงก์'}
            action={
              <Link to="/">
                <Button>← กลับรายการทั้งหมด</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const link = t.inviteToken ? `${location.origin}/v/${t.inviteToken}` : ''
  const cfg = settings ?? defaultSettings(t.tenantId)
  const defaultMessage = renderInviteMessage(cfg.inviteMessageTemplate, {
    vendor: t.vendor.name,
    vendorPrefix: t.vendor.prefix ?? '',
    date: fmtDateTH(t.transferDate),
    amount: fmtTHB(t.netAmount),
    link,
    client: cfg.displayName,
  })
  const message = editedMessage ?? defaultMessage

  // All line items (legacy rows carry a single amount-only line).
  const items = (
    t.lineItems?.some((it) => it.description || it.amount)
      ? t.lineItems
      : [{ description: t.description, amount: t.grossAmount }]
  ).map(normalizeLineItem)

  const copyText = async (text: string, kind: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable in some browsers */
    }
    setCopiedKind(kind)
    setTimeout(() => setCopiedKind(''), 1600)
  }

  // A receipt exists once it's been issued (or the document was voided after issue).
  const canViewReceipt = !!t.receiptNumber && t.status !== 'signed'
  const canIssue = t.status === 'signed'

  const attachSlip = async () => {
    setSlipErr('')
    setSlipBusy(true)
    try {
      await acts.attachSlip(t.id, { slipReference: slipRef, slipName })
      setSlipName('')
    } catch (e) {
      setSlipErr(e instanceof Error ? e.message : 'บันทึกสลิปไม่สำเร็จ')
    } finally {
      setSlipBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-body font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={16} /> กลับ
        </button>
        <StatusBadge status={t.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardBody>
              <p className="font-mono text-body text-ink-500">{t.id}</p>
              <h1 className="mt-1 text-xl font-semibold">{t.description}</h1>
              <p className="mt-1 text-body text-ink-500">
                {vendorDisplayName(t.vendor.prefix, t.vendor.name)} · {t.vendor.address} · ID {t.vendor.taxId ?? t.vendor.maskedId}
              </p>
              {t.receiptNumber && (
                <p className="mt-2 text-body">
                  <span className="text-ink-500">เลขที่ใบเสร็จ: </span>
                  <span className="font-mono font-semibold">{t.receiptNumber}</span>
                </p>
              )}
              {corrections.length > 0 && (
                <div className="mt-3 rounded-control bg-warning-soft p-3 text-body">
                  <p className="font-semibold text-warning">ผู้ขายแก้ไขข้อมูลที่บันทึกไว้:</p>
                  <ul className="mt-1 list-disc pl-5 text-warning">
                    {corrections.map((x, i) => (
                      <li key={i}>{x.field === 'name' ? 'ชื่อ' : x.field === 'address' ? 'ที่อยู่' : 'คำนำหน้า'}: {x.from || '—'} → <b>{x.to || '—'}</b></li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-3 text-body sm:grid-cols-4">
                <div className="rounded-control bg-ink-50 p-3"><dt className="text-label text-ink-500">ยอดรวม (ฐานภาษี)</dt><dd className="font-semibold tabular-nums">{fmtTHB(t.grossAmount)}</dd></div>
                <div className="rounded-control bg-ink-50 p-3"><dt className="text-label text-ink-500">หักภาษี ณ ที่จ่าย {t.whtRate}%</dt><dd className="font-semibold tabular-nums">{fmtTHB(t.whtAmount)}</dd></div>
                <div className="rounded-control bg-primary p-3 text-white"><dt className="text-label text-white/85">ยอดรับสุทธิ</dt><dd className="font-semibold tabular-nums">{fmtTHB(t.netAmount)}</dd></div>
                <div className="rounded-control bg-ink-50 p-3"><dt className="text-label text-ink-500">วันที่โอน</dt><dd className="font-semibold">{fmtDateTH(t.transferDate)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 text-body">
                {t.checks.map((c) => (
                  <span key={c.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${c.state === 'pass' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                    {c.state === 'pass' ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />} {c.label}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="font-semibold">รายการ</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-body">
                  <thead>
                    <tr className="border-b border-card-border text-label font-medium text-ink-500">
                      <th className="py-2 pr-2 text-right">#</th>
                      <th className="px-2 py-2 text-left">รายละเอียด</th>
                      <th className="px-2 py-2 text-right">จำนวน</th>
                      <th className="px-2 py-2 text-right">หน่วย</th>
                      <th className="px-2 py-2 text-right">ราคา/หน่วย</th>
                      <th className="px-2 py-2 text-right">ส่วนลด</th>
                      <th className="px-2 py-2 text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-b border-card-border last:border-0">
                        <td className="py-2 pr-2 text-right font-mono text-label text-ink-400">{i + 1}</td>
                        <td className="px-2 py-2">{it.description}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{it.quantity ?? 1}</td>
                        <td className="px-2 py-2 text-right text-ink-600">{it.unit || 'รายการ'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtTHB(it.unitPrice ?? it.amount)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-500">{it.discount ? fmtTHB(it.discount) : '—'}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtTHB(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold [&>td]:border-t [&>td]:border-card-border">
                      <td colSpan={6} className="py-2 pr-2 text-right">รวม</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTHB(itemsTotal(items))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="font-semibold">ไทม์ไลน์</h2>
              <ol className="mt-3 space-y-0">
                {t.timeline.map((e, i) => (
                  <li key={i} className="relative pb-4 pl-6 last:pb-0">
                    <span className="absolute left-1 top-1.5 h-2 w-2 rounded-full bg-primary" />
                    {i < t.timeline.length - 1 && <span className="absolute left-[11px] top-4 h-full w-px bg-ink-100" />}
                    <p className="text-body font-semibold">{e.label}</p>
                    <p className="text-body text-ink-500">{fmtDateTH(e.at)}{e.detail ? ` · ${e.detail}` : ''}</p>
                  </li>
                ))}
              </ol>
              {t.status === 'void' && t.voidReason && (
                <p className="mt-3 rounded-control bg-danger-soft p-3 text-body font-medium text-danger">ยกเลิกเอกสาร: {t.voidReason} · เลขที่เดิมคงไว้ และออกเลขที่ใหม่แทน</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="flex items-center gap-2 font-semibold"><Link2 size={16} /> ส่งลิงก์ให้ผู้ขาย</h2>
              {link ? (
                <>
                  <div>
                    <Label hint="แก้ไขได้ก่อนส่ง">ข้อความเชิญผู้ขาย</Label>
                    <Textarea
                      rows={6}
                      value={message}
                      onChange={(e) => setEditedMessage(e.target.value)}
                    />
                    {editedMessage !== null && (
                      <button
                        type="button"
                        onClick={() => setEditedMessage(null)}
                        className="mt-1.5 inline-flex items-center gap-1 text-label font-medium text-ink-500 transition hover:text-ink-900"
                      >
                        <RotateCcw size={12} /> รีเซ็ตเป็นข้อความเริ่มต้น
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => copyText(message, 'message')} title="คัดลอกข้อความพร้อมลิงก์ไปวางในแชท">
                      <Copy size={15} /> {copiedKind === 'message' ? 'คัดลอกข้อความแล้ว' : 'คัดลอกข้อความ'}
                    </Button>
                    <Button variant="secondary" onClick={() => copyText(link, 'link')}>
                      <Copy size={15} /> {copiedKind === 'link' ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์'}
                    </Button>
                  </div>
                  <p className="break-all rounded-control bg-ink-50 p-3 font-mono text-label text-ink-500">{link}</p>
                  <p className="rounded-control bg-ink-50 p-3 text-label text-ink-500">
                    ระบบ<b>ไม่ส่งข้อความเอง</b> — โปรดคัดลอกข้อความด้านบนแล้ว<b>วางในแชท (LINE)</b> ของท่าน ·
                    ลิงก์ใช้ได้หลายครั้งจนกว่าผู้ขายจะลงนาม มีวันหมดอายุ และสามารถเพิกถอนได้ · ปรับข้อความเริ่มต้นได้ที่เมนู “ตั้งค่า”
                  </p>
                  <p className={`text-label font-semibold ${t.taxIdLast4 ? 'text-success' : 'text-warning'}`}>
                    {t.taxIdLast4 ? `ล็อกด้วยเลขบัตรประชาชน (ลงท้าย ${t.taxIdLast4}) — ผู้ที่ไม่มีเลขบัตรจะเปิดไม่ได้` : 'รายการก่อนหน้า — ไม่ได้ตั้งการล็อกด้วยเลขบัตรประชาชน'}
                  </p>
                  <Button variant="ghost" className="w-full" onClick={() => setConfirmRevoke(true)}>
                    เพิกถอนลิงก์
                  </Button>
                </>
              ) : (
                <p className="text-body text-ink-500">ยังไม่มีลิงก์ — เลือก “สร้างลิงก์ให้ผู้ขาย” จากนั้นคัดลอกข้อความไปวางในแชท</p>
              )}
              {t.status === 'draft' && (
                <Button className="w-full" onClick={() => { acts.send(t.id) }}>สร้างลิงก์ให้ผู้ขาย</Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-semibold">สลิปโอนเงิน</h2>
              <p className="text-body text-ink-500">สลิป {t.slipReference || '— ยังไม่แนบ'} · {t.slipName || '—'}</p>
              {!t.slipReference && (
                <div className="space-y-2 rounded-control bg-ink-50 p-3">
                  <Label>แนบสลิปภายหลัง (ไม่บังคับ)</Label>
                  <Input value={slipRef} onChange={(e) => setSlipRef(e.target.value)} placeholder="เลขที่อ้างอิงสลิป เช่น TRF-881201" className="font-mono" />
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-control border border-dashed border-ink-300 bg-white px-3.5 text-body font-medium text-ink-700 hover:border-ink-900">
                    <UploadCloud size={17} />
                    <span className="truncate">{slipName || 'เลือกไฟล์สลิป…'}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setSlipName(e.target.files?.[0]?.name ?? '')} />
                  </label>
                  <FieldError msg={slipErr} />
                  <Button variant="secondary" className="w-full" disabled={slipBusy || (!slipRef.trim() && !slipName)} onClick={attachSlip}>
                    {slipBusy ? 'กำลังบันทึก…' : 'บันทึกสลิป'}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-semibold">เอกสารใบเสร็จ</h2>
              {canViewReceipt ? (
                <Link to={`/receipts/${t.id}`} className="block">
                  <Button className="w-full">
                    <ExternalLink size={15} /> เปิดใบเสร็จ · ดาวน์โหลด PDF
                  </Button>
                </Link>
              ) : canIssue ? (
                <>
                  <Button className="w-full" onClick={() => setConfirmIssue(true)}>
                    ออกใบเสร็จ
                  </Button>
                  <p className="text-label text-ink-400">
                    ผู้ขายลงนามแล้ว — ออกเลขที่ใบเสร็จและสร้างเอกสารสำหรับรายการนี้ (ดำเนินการแล้วแก้ไขไม่ได้)
                  </p>
                </>
              ) : (
                <>
                  <Button className="w-full" disabled title="จะออกใบเสร็จได้หลังผู้ขายลงนามแล้ว">ออกใบเสร็จ</Button>
                  <p className="text-label text-ink-400">จะออกใบเสร็จได้หลังผู้ขายลงนามแล้ว</p>
                </>
              )}
              {t.status !== 'void' && (
                !showVoid ? (
                  <Button variant="ghost" onClick={() => setShowVoid(true)}>ยกเลิกเอกสาร…</Button>
                ) : (
                  <div className="space-y-2">
                    <Label>เหตุผลการยกเลิก (จำเป็น)</Label>
                    <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="เช่น ยอดรวมก่อนหักภาษีไม่ถูกต้อง…" />
                    <div className="flex gap-2">
                      <Button variant="danger" disabled={!voidReason.trim()} onClick={() => setConfirmVoid(true)}>
                        ยกเลิกเอกสาร
                      </Button>
                      <Button variant="ghost" onClick={() => setShowVoid(false)}>ปิด</Button>
                    </div>
                  </div>
                )
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmIssue}
        tone="primary"
        title="ยืนยันการออกใบเสร็จ"
        message="ระบบจะออกเลขที่ใบเสร็จและล็อกเอกสารสำหรับรายการนี้ ดำเนินการแล้วจะไม่สามารถแก้ไขได้"
        confirmLabel="ออกใบเสร็จ"
        onConfirm={async () => {
          setConfirmIssue(false)
          await acts.issue(t.id)
          // Issued — open the receipt so it can be viewed/downloaded right away.
          nav(`/receipts/${t.id}`)
        }}
        onCancel={() => setConfirmIssue(false)}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="ยืนยันการเพิกถอนลิงก์"
        message="ผู้ขายจะไม่สามารถเปิดลิงก์นี้ได้อีก และต้องสร้างลิงก์ใหม่หากต้องการส่งอีกครั้ง"
        confirmLabel="เพิกถอนลิงก์"
        onConfirm={() => { setConfirmRevoke(false); void acts.revoke(t.id) }}
        onCancel={() => setConfirmRevoke(false)}
      />
      <ConfirmDialog
        open={confirmVoid}
        title="ยืนยันการยกเลิกเอกสาร"
        message={<>เหตุผล: <b>{voidReason.trim()}</b><br />เอกสารที่ออกเลขที่แล้วจะไม่ถูกลบ แต่จะถูกทำเครื่องหมายว่ายกเลิก</>}
        confirmLabel="ยกเลิกเอกสาร"
        onConfirm={() => { setConfirmVoid(false); setShowVoid(false); void acts.voidTxn(t.id, voidReason.trim()) }}
        onCancel={() => setConfirmVoid(false)}
      />
    </div>
  )
}
