import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Flag, PencilLine, ShieldAlert } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { mockReceiptNumber } from '../lib/receipt'
import { fmtTHB, fmtDateTH } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { StatusBadge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'

type Decision = 'approved' | 'needs-fix' | 'flagged'
interface Review { decision: Decision; note: string; at: string }

const RKEY = 'taxwork-pilot-review-v1'
function readReviews(): Record<string, Review> {
  try {
    return JSON.parse(localStorage.getItem(RKEY) ?? '{}')
  } catch {
    return {}
  }
}

const DECISION_TH: Record<Decision, string> = {
  approved: 'อนุมัติ',
  'needs-fix': 'ขอแก้ไข',
  flagged: 'ปักหมุด',
}

export function ReviewList() {
  const { data } = useTransactions('', 'all')
  const [reviews, setReviews] = useState(readReviews)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const rows = useMemo(
    () => (data ?? []).filter((t) => t.status !== 'draft' && t.status !== 'cancelled'),
    [data],
  )
  const pending = rows.filter((t) => !reviews[t.id]).length

  const decide = (id: string, decision: Decision) => {
    const note = (notes[id] ?? '').trim()
    if (decision !== 'approved' && !note) return
    const next = { ...reviews, [id]: { decision, note, at: new Date().toISOString() } }
    setReviews(next)
    localStorage.setItem(RKEY, JSON.stringify(next))
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ตรวจสอบโดยนักบัญชี</h1>
        <p className="mt-1 text-sm text-ink-500">
          สลิปอยู่ข้างทุกรายการ · เช็กด้วยตา · เหลือรอตรวจ {pending} รายการ (mock — บันทึกในเครื่อง)
        </p>
      </div>

      <div className="grid gap-3">
        {rows.map((t) => {
          const r = reviews[t.id]
          return (
            <Card key={t.id}>
              <CardBody className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-ink-500">{mockReceiptNumber(t.id)}</span>
                    <StatusBadge status={t.status} />
                    {r && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.decision === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.decision === 'needs-fix' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                        {DECISION_TH[r.decision]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-bold">{t.description}</p>
                  <p className="text-sm text-ink-500">
                    {t.vendor.name} · โอน {fmtDateTH(t.transferDate)} · สุทธิ <b className="tabular-nums">฿{fmtTHB(t.netAmount)}</b>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
                    {t.checks.map((c) => (
                      <span key={c.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${c.state === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {c.state === 'pass' ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />} {c.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-200 font-mono text-[10px]">SLIP</span>
                    <span>สลิป {t.slipReference} · {t.slipName} <span className="text-ink-400">(เทียบยอด/ชื่อด้วยตา)</span></span>
                    <Link to={`/transactions/${t.id}`} className="ml-auto shrink-0 font-semibold text-ink-700 underline">เปิดรายการ</Link>
                  </div>
                  {r?.note && <p className="mt-2 text-sm text-ink-500">หมายเหตุ: {r.note}</p>}
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-3 lg:border-0 lg:pt-0">
                  <Label>ความเห็น + บันทึก</Label>
                  <Input
                    value={notes[t.id] ?? r?.note ?? ''}
                    onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                    placeholder="เช่น สลิปไม่ชัด ขอสลิปใหม่…"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button variant="secondary" className="h-10 px-2 text-[13px]" onClick={() => decide(t.id, 'approved')}>
                      <CheckCircle2 size={14} /> อนุมัติ
                    </Button>
                    <Button variant="secondary" className="h-10 px-2 text-[13px]" onClick={() => decide(t.id, 'needs-fix')}>
                      <PencilLine size={14} /> ขอแก้ไข
                    </Button>
                    <Button variant="secondary" className="h-10 px-2 text-[13px]" onClick={() => decide(t.id, 'flagged')}>
                      <Flag size={14} /> ปักหมุด
                    </Button>
                  </div>
                  <p className="text-xs text-ink-400">ขอแก้ไข/ปักหมุดต้องมีหมายเหตุ · อนุมัติไม่ต้องมีก็ได้</p>
                </div>
              </CardBody>
            </Card>
          )
        })}
        {rows.length === 0 && (
          <Card><CardBody className="py-12 text-center text-sm text-ink-500">ยังไม่มีรายการให้ตรวจ</CardBody></Card>
        )}
      </div>
    </div>
  )
}
