import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, Download, Link2, ShieldAlert } from 'lucide-react'
import { useTransaction, useTransactionActions } from '../hooks/useTransactions'
import { getAuth } from '../hooks/useVendor'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { fmtTHB, fmtDateTH } from '../lib/format'

export function TransactionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: t } = useTransaction(id)
  const acts = useTransactionActions()
  const [voidReason, setVoidReason] = useState('')
  const [showVoid, setShowVoid] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!t) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm font-semibold text-ink-500">← กลับรายการ</Link>
        <p>ไม่พบรายการ</p>
      </div>
    )
  }

  const link = t.inviteToken ? `${location.origin}/v/${t.inviteToken}` : ''
  const corrections = getAuth(t.id)?.corrections ?? []
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard unavailable in some browsers */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
          <ArrowLeft size={16} /> กลับ
        </button>
        <StatusBadge status={t.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardBody>
              <p className="font-mono text-[13px] text-ink-500">{t.id}</p>
              <h1 className="mt-1 text-xl font-bold">{t.description}</h1>
              <p className="mt-1 text-sm text-ink-500">
                {t.vendor.name} · {t.vendor.address} · ID {t.vendor.maskedId}
              </p>
              {corrections.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
                  <p className="font-bold text-amber-800">ผู้ขายแก้ไขข้อมูลที่กรอกไว้:</p>
                  <ul className="mt-1 list-disc pl-5 text-amber-800">
                    {corrections.map((x, i) => (
                      <li key={i}>{x.field === 'name' ? 'ชื่อ' : 'ที่อยู่'}: {x.from} → <b>{x.to}</b></li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-3 text-[15px] sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-ink-500">gross</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.grossAmount)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-ink-500">WHT {t.whtRate}%</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.whtAmount)}</dd></div>
                <div className="rounded-xl bg-ink-900 p-3 text-white"><dt className="text-xs text-white/70">สุทธิ</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-ink-500">วันที่โอน</dt><dd className="font-bold">{fmtDateTH(t.transferDate)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
                {t.checks.map((c) => (
                  <span key={c.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${c.state === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {c.state === 'pass' ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />} {c.label}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="font-bold">ไทม์ไลน์</h2>
              <ol className="mt-3 space-y-0">
                {t.timeline.map((e, i) => (
                  <li key={i} className="relative pb-4 pl-6 last:pb-0">
                    <span className="absolute left-1 top-1.5 h-2 w-2 rounded-full bg-ink-900" />
                    {i < t.timeline.length - 1 && <span className="absolute left-[11px] top-4 h-full w-px bg-slate-200" />}
                    <p className="text-[15px] font-semibold">{e.label}</p>
                    <p className="text-[13px] text-ink-500">{fmtDateTH(e.at)}{e.detail ? ` · ${e.detail}` : ''}</p>
                  </li>
                ))}
              </ol>
              {t.status === 'void' && t.voidReason && (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">void: {t.voidReason} · เลขเดิมคงไว้ ออกเลขใหม่แทน</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="flex items-center gap-2 font-bold"><Link2 size={16} /> ลิงก์ผู้ขาย (LINE)</h2>
              {link ? (
                <>
                  <p className="truncate rounded-xl bg-slate-50 p-3 font-mono text-[13px]">{link}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={copy}><Copy size={15} /> {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}</Button>
                    <Button variant="ghost" onClick={() => { acts.revoke(t.id); }}>เพิกถอน</Button>
                  </div>
                  <p className="text-xs text-ink-500">ส่งลิงก์นี้ในแชท LINE ของคุณเอง — ระบบไม่ส่งข้อความ · ลิงก์ใช้ครั้งเดียว มีวันหมดอายุ เพิกถอนได้</p>
                  <p className={`text-xs font-semibold ${t.taxIdLast4 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {t.taxIdLast4 ? `🔒 ล็อกด้วย Tax ID (ลงท้าย ${t.taxIdLast4}) — คนผิดเปิดไม่ได้` : '⚠ รายการเก่า — ไม่มี Tax ID gate'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-500">ลิงก์ถูกเพิกถอน / ใช้แล้ว — กด “ส่งลิงก์” เพื่อออกใหม่อีกครั้ง (backend จริงใน Phase 1)</p>
              )}
              {t.status === 'draft' && (
                <Button onClick={() => { acts.send(t.id); }}>ส่งลิงก์ให้ผู้ขาย</Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-bold">เอกสาร</h2>
              <p className="text-sm text-ink-500">สลิป {t.slipReference || '— ยังไม่แนบ'} · {t.slipName || '—'}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled title="PDF ออกเมื่อผู้ขายเซ็น (Phase 3)"><Download size={15} /> PDF (Phase 3)</Button>
                <Button variant="secondary" onClick={() => window.print()}><Download size={15} /> พิมพ์</Button>
              </div>
              {!showVoid ? (
                <Button variant="ghost" onClick={() => setShowVoid(true)}>void เอกสาร…</Button>
              ) : (
                <div className="space-y-2">
                  <Label>เหตุผล void (บังคับ)</Label>
                  <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="เช่น ยอด gross ผิด…" />
                  <div className="flex gap-2">
                    <Button variant="danger" disabled={!voidReason.trim()} onClick={() => { acts.voidTxn(t.id, voidReason.trim()); setShowVoid(false); }}>
                      ยืนยัน void
                    </Button>
                    <Button variant="ghost" onClick={() => setShowVoid(false)}>ยกเลิก</Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
