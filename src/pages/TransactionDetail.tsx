import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Link2, ShieldAlert } from 'lucide-react'
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
  const [copiedKind, setCopiedKind] = useState<'' | 'link' | 'message'>('')

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
  const inviteMessage = `สวัสดีครับ/ค่ะ คุณ${t.vendor.name}

แจ้งยอดโอนสำหรับรายการ ${t.id} (${fmtDateTH(t.transferDate)})
ยอดรับสุทธิ ฿${fmtTHB(t.netAmount)}

กรุณาเปิดลิงก์เพื่อเซ็นรับเงินและมอบอำนาจออกใบเสร็จ (ลิงก์ใช้ได้ครั้งเดียว):
${link}`

  const copyText = async (text: string, kind: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable in some browsers */
    }
    setCopiedKind(kind)
    setTimeout(() => setCopiedKind(''), 1600)
  }

  const canIssue = t.status === 'signed' || t.status === 'issued'

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
                {t.vendor.name} · {t.vendor.address} · ID {t.vendor.taxId ?? t.vendor.maskedId}
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
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-ink-500">ยอดรวม (ฐานภาษี)</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.grossAmount)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-ink-500">หักภาษี ณ ที่จ่าย {t.whtRate}%</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.whtAmount)}</dd></div>
                <div className="rounded-xl bg-ink-900 p-3 text-white"><dt className="text-xs text-white/70">ยอดรับสุทธิ</dt><dd className="font-bold tabular-nums">฿{fmtTHB(t.netAmount)}</dd></div>
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
              <h2 className="flex items-center gap-2 font-bold"><Link2 size={16} /> ส่งลิงก์ให้ผู้ขาย</h2>
              {link ? (
                <>
                  <p className="truncate rounded-xl bg-slate-50 p-3 font-mono text-[13px]">{link}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => copyText(inviteMessage, 'message')} title="คัดลอกข้อความพร้อมลิงก์ ไปวางในแชท">
                      <Copy size={15} /> {copiedKind === 'message' ? 'คัดลอกข้อความแล้ว ✓' : 'คัดลอกข้อความ'}
                    </Button>
                    <Button variant="secondary" onClick={() => copyText(link, 'link')}>
                      <Copy size={15} /> {copiedKind === 'link' ? 'คัดลอกลิงก์แล้ว ✓' : 'คัดลอกลิงก์'}
                    </Button>
                  </div>
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-ink-500">
                    ระบบ<b>ไม่ส่งข้อความเอง</b> — คัดลอกข้อความด้านบนแล้ว<b>วางในแชท (LINE)</b> ของคุณเอง ·
                    ลิงก์ใช้ได้ครั้งเดียว มีวันหมดอายุ และเพิกถอนได้
                  </p>
                  <p className={`text-xs font-semibold ${t.taxIdLast4 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {t.taxIdLast4 ? `🔒 ล็อกด้วยเลขบัตรประชาชน (ลงท้าย ${t.taxIdLast4}) — ผู้ที่ไม่มีเลขบัตรเปิดไม่ได้` : '⚠ รายการก่อนหน้า — ไม่ได้ตั้งการล็อกด้วยเลขบัตรประชาชน'}
                  </p>
                  <Button variant="ghost" className="w-full" onClick={() => { acts.revoke(t.id) }}>
                    เพิกถอนลิงก์
                  </Button>
                </>
              ) : (
                <p className="text-sm text-ink-500">ยังไม่มีลิงก์ — เลือก “สร้างลิงก์ให้ผู้ขาย” แล้วคัดลอกข้อความไปวางในแชท</p>
              )}
              {t.status === 'draft' && (
                <Button className="w-full" onClick={() => { acts.send(t.id) }}>สร้างลิงก์ให้ผู้ขาย</Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-bold">เอกสาร</h2>
              <p className="text-sm text-ink-500">สลิป {t.slipReference || '— ยังไม่แนบ'} · {t.slipName || '—'}</p>
              <Link to={canIssue ? `/receipts/${t.id}` : '#'} className="block">
                <Button className="w-full" disabled={!canIssue} title={canIssue ? 'ดูตัวอย่าง / ดาวน์โหลด PDF' : 'PDF ออกเมื่อผู้ขายเซ็นแล้ว'}>
                  <ExternalLink size={15} /> {canIssue ? 'เปิดใบเสร็จ · ดาวน์โหลด PDF' : 'PDF ออกหลังผู้ขายเซ็น'}
                </Button>
              </Link>
              {!canIssue && (
                <p className="text-xs text-ink-400">
                  ใบเสร็จจะออกเลข + ดาวน์โหลดได้หลังผู้ขายเซ็น
                </p>
              )}
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
