import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Copy, FileCheck2, Send, X } from 'lucide-react'
import { attentionFor } from '../../lib/attention'
import { fmtDateTH, fmtTHB } from '../../lib/format'
import { vendorDisplayName } from '../../lib/vendor-name'
import type { PaymentTransaction } from '../../lib/types'
import { StatusBadge } from '../ui/badge'
import { Button } from '../ui/button'
import { primaryActionFor } from './transaction-stage'

export function TxnPreviewDrawer({
  t,
  onClose,
  onSend,
  onCopyLink,
  onIssue,
}: {
  t: PaymentTransaction | null
  onClose: () => void
  onSend: (t: PaymentTransaction) => void
  onCopyLink: (t: PaymentTransaction) => void
  onIssue: (t: PaymentTransaction) => void
}) {
  useEffect(() => {
    if (!t) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [t])

  if (!t) return null
  const attention = attentionFor(t)
  const primary = primaryActionFor(t.status)

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`ตัวอย่างรายการ ${t.id}`}>
      <button type="button" aria-label="ปิดตัวอย่าง" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-card">
        <div className="flex items-start gap-3 border-b border-card-border p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-title font-semibold">{vendorDisplayName(t.vendor.prefix, t.vendor.name)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-label text-ink-500">
              <span className="font-mono">{t.id}</span>
              <StatusBadge status={t.status} />
              {attention && <span className="font-semibold text-warning">{attention.label}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด (Esc)"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          <dl className="grid grid-cols-2 gap-3 text-body">
            <div className="rounded-control bg-ink-50 p-3">
              <dt className="text-label text-ink-500">ยอดสุทธิ</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{fmtTHB(t.netAmount)}</dd>
            </div>
            <div className="rounded-control bg-ink-50 p-3">
              <dt className="text-label text-ink-500">วันที่โอน</dt>
              <dd className="mt-0.5 font-semibold">{fmtDateTH(t.transferDate)}</dd>
            </div>
            <div className="rounded-control bg-ink-50 p-3">
              <dt className="text-label text-ink-500">สลิป</dt>
              <dd className="mt-0.5 truncate font-mono text-label">{t.slipReference || 'ยังไม่แนบ'}</dd>
            </div>
            <div className="rounded-control bg-ink-50 p-3">
              <dt className="text-label text-ink-500">ใบเสร็จ</dt>
              <dd className="mt-0.5 truncate font-mono text-label">{t.receiptNumber ?? '—'}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-label font-medium text-ink-500">รายการ</p>
            <ul className="space-y-1.5">
              {t.lineItems.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-body">
                  <span className="min-w-0 flex-1 truncate">{it.description}</span>
                  <span className="shrink-0 tabular-nums">{fmtTHB(it.amount)}</span>
                </li>
              ))}
            </ul>
            {t.note?.trim() && <p className="mt-2 text-label text-ink-500">{t.note}</p>}
          </div>

          {t.timeline.length > 0 && (
            <div>
              <p className="mb-1.5 text-label font-medium text-ink-500">ประวัติ</p>
              <ol className="space-y-1.5">
                {t.timeline.slice(-5).map((ev, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-label">
                    <span className="shrink-0 tabular-nums text-ink-400">{fmtDateTH(ev.at.slice(0, 10))}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">
                      {ev.label}
                      {ev.detail ? ` · ${ev.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-card-border p-4">
          {primary?.kind === 'send' && (
            <Button onClick={() => onSend(t)}>
              <Send size={15} aria-hidden /> {primary.label}
            </Button>
          )}
          {primary?.kind === 'copy' && (
            <Button onClick={() => onCopyLink(t)}>
              <Copy size={15} aria-hidden /> {primary.label}
            </Button>
          )}
          {primary?.kind === 'issue' && (
            <Button onClick={() => onIssue(t)}>
              <FileCheck2 size={15} aria-hidden /> {primary.label}
            </Button>
          )}
          <Link to={`/transactions/${t.id}`} className="ml-auto inline-flex items-center gap-1 text-body font-semibold text-primary-text hover:underline">
            เปิดหน้าเต็ม <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
      </aside>
    </div>
  )
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  const rows: [string, string][] = [
    ['/', 'ค้นหา'],
    ['f', 'เปิด/ปิดตัวกรอง'],
    ['j / k', 'เลื่อนแถวลง / ขึ้น'],
    ['Enter', 'เปิดตัวอย่างแถวที่เลือก'],
    ['c', 'คัดลอกลิงก์แถวที่เลือก'],
    ['s', 'สร้างลิงก์แถวที่เลือก'],
    ['?', 'เปิด/ปิดหน้าต่างนี้'],
    ['Esc', 'ปิดตัวอย่าง / หน้าต่างนี้'],
  ]
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="คีย์ลัด">
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm rounded-card bg-white p-5 shadow-card">
        <h2 className="text-title font-semibold">คีย์ลัด</h2>
        <ul className="mt-3 space-y-2">
          {rows.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between text-body">
              <span className="text-ink-600">{label}</span>
              <kbd className="rounded-control bg-ink-100 px-2 py-0.5 font-mono text-label font-semibold text-ink-700">{k}</kbd>
            </li>
          ))}
        </ul>
        <div className="mt-4 text-right">
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}
