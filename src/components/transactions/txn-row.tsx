import { Link } from 'react-router-dom'
import { AlertTriangle, Copy, ExternalLink, Paperclip } from 'lucide-react'
import { attentionFor } from '../../lib/attention'
import { inviteUrl } from '../../lib/app-url'
import { fmtDateTH, fmtTHB } from '../../lib/format'
import { vendorDisplayName } from '../../lib/vendor-name'
import type { PaymentTransaction } from '../../lib/types'
import { StatusBadge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'
import { useToast } from '../ui/toast'
import { cn } from '../../lib/cn'

/** One transaction row. Clickable AND keyboard-operable. */
export function TxnRow({
  t,
  selected,
  onToggle,
  onOpen,
  dense,
}: {
  t: PaymentTransaction
  selected: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  dense: boolean
}) {
  const toast = useToast()
  const link = inviteUrl(t.inviteToken)
  const attention = attentionFor(t)
  const pad = dense ? 'py-1.5' : 'py-2.5'

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(link)
      toast.show('คัดลอกลิงก์ผู้ขายแล้ว')
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
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
          <span className="font-mono">{t.id}</span>
          {t.slipReference ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono">
                <Paperclip size={10} className="shrink-0 text-ink-400" aria-hidden />
                {t.slipReference}
              </span>
            </>
          ) : (
            <span className="text-ink-400">· ไม่มีสลิป</span>
          )}
        </p>
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

      <td className={cn('border-b border-card-border px-2 text-right', pad)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {link && (
            <button
              type="button"
              onClick={copy}
              title="คัดลอกลิงก์ผู้ขาย"
              aria-label={`คัดลอกลิงก์ผู้ขายของรายการ ${t.id}`}
              className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <Copy size={15} aria-hidden />
            </button>
          )}
          {t.receiptNumber ? (
            <Link
              to={`/receipts/${t.id}`}
              onClick={(e) => e.stopPropagation()}
              title="เปิดใบเสร็จ"
              aria-label={`เปิดใบเสร็จของรายการ ${t.id}`}
              className="grid h-8 w-8 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <ExternalLink size={15} aria-hidden />
            </Link>
          ) : (
            // Keeps the copy button in the same place whether or not a receipt
            // link exists, so the column does not shift row to row.
            <span className="block h-8 w-8" aria-hidden />
          )}
        </div>
      </td>
    </tr>
  )
}
