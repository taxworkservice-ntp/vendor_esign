import { Link } from 'react-router-dom'
import { AlertTriangle, Copy, FileCheck2, FileText, Paperclip, Send } from 'lucide-react'
import { attentionFor } from '../../lib/attention'
import { fmtDateTH, fmtDateTimeTH, fmtTHB } from '../../lib/format'
import { vendorDisplayName } from '../../lib/vendor-name'
import type { PaymentTransaction } from '../../lib/types'
import { StatusBadge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { primaryActionFor } from './transaction-stage'
import { cn } from '../../lib/cn'

/** One transaction row. Clickable AND keyboard-operable. */
export function TxnRow({
  t,
  selected,
  onToggle,
  onOpen,
  onSend,
  onCopyLink,
  onIssue,
  dense,
}: {
  t: PaymentTransaction
  selected: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onSend: (t: PaymentTransaction) => void
  onCopyLink: (t: PaymentTransaction) => void
  onIssue: (t: PaymentTransaction) => void
  dense: boolean
}) {
  const attention = attentionFor(t)
  const pad = dense ? 'py-1.5' : 'py-2.5'
  const primary = primaryActionFor(t.status)

  // The one next action for this row, as a small, clearly-labeled button
  // (shared status mapping with the detail band). Never wraps.
  const renderPrimary = () => {
    if (!primary) return null
    const cls = 'h-8 whitespace-nowrap px-2.5 gap-1.5 text-label'
    if (primary.kind === 'send')
      return (
        <Button variant="soft" className={cls} onClick={() => onSend(t)} title="สร้างลิงก์และคัดลอกให้ทันที">
          <Send size={14} aria-hidden /> {primary.label}
        </Button>
      )
    if (primary.kind === 'copy')
      return (
        <Button variant="soft" className={cls} onClick={() => onCopyLink(t)}>
          <Copy size={14} aria-hidden /> {primary.label}
        </Button>
      )
    if (primary.kind === 'issue')
      return (
        <Button variant="soft-success" className={cls} onClick={() => onIssue(t)} title="ออกเลขที่ใบเสร็จและสร้างเอกสาร">
          <FileCheck2 size={14} aria-hidden /> {primary.label}
        </Button>
      )
    // 'open'
    return (
      <Link to={`/receipts/${t.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex">
        <Button variant="soft-neutral" className={cls}>
          <FileText size={14} aria-hidden /> {primary.label}
        </Button>
      </Link>
    )
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(t.id)
    }
  }

  return (
    <tr
      // The row is the click target, so it carries the link semantics and the
      // keyboard handler. Without this, a keyboard user could not open a
      // transaction from the list at all.
      role="link"
      tabIndex={0}
      aria-label={`เปิดรายการ ${t.id} ของ ${vendorDisplayName(t.vendor.prefix, t.vendor.name)}`}
      onClick={() => onOpen(t.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'cursor-pointer transition hover:bg-ink-50 focus:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900',
        selected && 'bg-primary-soft/40',
      )}
    >
      <td className={cn('w-9 border-b border-card-border pl-3 pr-0', pad)} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(t.id)}
          label={`เลือกรายการ ${t.id}`}
          hideLabel
        />
      </td>

      <td className={cn('max-w-[180px] border-b border-card-border px-3', pad)}>
        <p className="truncate font-semibold">{vendorDisplayName(t.vendor.prefix, t.vendor.name)}</p>
        {attention && (
          <span
            className={cn(
              'mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-semibold',
              attention.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
            )}
            title={`${attention.label} — คลิกเพื่อเปิดรายละเอียด`}
          >
            <AlertTriangle size={10} className="shrink-0" aria-hidden />
            <span className="truncate">{attention.label}</span>
          </span>
        )}
      </td>

      <td className={cn('max-w-[340px] border-b border-card-border px-3', pad)}>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/transactions/${t.id}`}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate font-medium leading-snug hover:underline"
          >
            {t.note?.trim() || t.lineItems[0]?.description || t.description}
          </Link>
          {t.lineItems.length > 1 && (
            <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-micro font-semibold text-ink-600">
              {t.lineItems.length} รายการ
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 truncate text-label text-ink-500">
          {t.slipReference ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono">
              <Paperclip size={10} className="shrink-0 text-ink-400" aria-hidden />
              {t.slipReference}
            </span>
          ) : (
            <span className="text-ink-400">ไม่มีสลิป</span>
          )}
        </p>
      </td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 text-label text-ink-500', pad)}>
        {fmtDateTimeTH(t.createdAt)}
      </td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 tabular-nums', pad)}>{fmtDateTH(t.transferDate)}</td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 font-mono text-label', pad)}>
        {t.receiptNumber ?? <span className="font-sans text-ink-400">—</span>}
      </td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 text-right tabular-nums', pad)}>{fmtTHB(t.grossAmount)}</td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 text-right tabular-nums', pad)}>
        {fmtTHB(t.whtAmount)}
        <span className="ml-1.5 text-label text-ink-400">{t.whtRate}%</span>
      </td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3 text-right font-semibold tabular-nums', pad)}>
        {fmtTHB(t.netAmount)}
      </td>

      <td className={cn('whitespace-nowrap border-b border-card-border px-3', pad)}>
        <StatusBadge status={t.status} />
      </td>

      <td className={cn('border-b border-card-border px-3 text-right', pad)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end">{renderPrimary()}</div>
      </td>
    </tr>
  )
}
