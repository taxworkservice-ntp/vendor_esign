import { AlertTriangle, Coins, FileText, Landmark } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TxnTotals } from '../../lib/txn-filters'
import { fmtTHB } from '../../lib/format'

/**
 * Aggregate figures for the current filter, shown ABOVE the table.
 *
 * They describe the whole filtered set, not the page on screen, and they state
 * their basis: cancelled and void documents are excluded from the payable
 * totals, so the headline net is money actually owed. The excluded count is
 * printed so the two figures can be reconciled rather than silently differing.
 */
export function SummaryBar({
  totals,
  attentionOnPage,
  loading,
}: {
  totals: TxnTotals
  /**
   * Attention signals on the CURRENT PAGE. Deliberately scoped: deriving this
   * server-side would mean encoding relative-date aging rules in SQL, so the
   * label says "on this page" rather than implying a set-wide total.
   */
  attentionOnPage?: number
  loading?: boolean
}) {
  const cells: { label: string; value: string; icon: LucideIcon; emphasis?: boolean }[] = [
    { label: 'รายการที่ตรงเงื่อนไข', value: totals.count.toLocaleString('th-TH'), icon: FileText },
    { label: 'ยอดรวม (ฐานภาษี)', value: fmtTHB(totals.payableGross), icon: Coins },
    { label: 'หักภาษี ณ ที่จ่าย', value: fmtTHB(totals.payableWht), icon: Landmark },
    { label: 'ยอดสุทธิที่ต้องจ่าย', value: fmtTHB(totals.payableNet), icon: Coins },
  ]

  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-card-border bg-card-border sm:grid-cols-4"
      aria-busy={loading || undefined}
    >
      {cells.map(({ label, value, icon: Icon, emphasis }) => (
        <div
          key={label}
          className={emphasis ? 'bg-primary px-4 py-3 text-white' : 'bg-white px-4 py-3'}
        >
          <p
            className={
              emphasis
                ? 'flex items-center gap-1.5 text-label font-medium text-white/85'
                : 'flex items-center gap-1.5 text-label text-ink-500'
            }
          >
            <Icon size={13} aria-hidden />
            {label}
          </p>
          <p className="mt-0.5 text-title font-semibold tabular-nums">{loading ? '—' : value}</p>
        </div>
      ))}

      {(totals.voidedCount > 0 || (attentionOnPage ?? 0) > 0) && (
        <p className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 bg-white px-4 py-2 text-label text-ink-500 sm:col-span-4">
          {totals.voidedCount > 0 && (
            <span>
              ไม่รวมรายการที่ยกเลิก/เพิกถอน {totals.voidedCount.toLocaleString('th-TH')} รายการ
              {totals.net !== totals.payableNet && ` (มูลค่ารวมทั้งหมด ${fmtTHB(totals.net)} บาท)`}
            </span>
          )}
          {(attentionOnPage ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
              <AlertTriangle size={13} aria-hidden />
              ต้องติดตาม {attentionOnPage} รายการในหน้านี้
            </span>
          )}
        </p>
      )}
    </div>
  )
}
