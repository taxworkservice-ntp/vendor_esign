import { useMemo } from 'react'
import type { WhtSummary } from '../../lib/wht-summary'
import { fmtTHB } from '../../lib/format'

/**
 * Register totals plus the per-form split.
 *
 * A withholding-tax register exists to be reconciled against a filed return, and
 * a return is filed per form — so the form breakdown is the part that actually
 * gets checked. The list had no aggregate at all before this; the user added up
 * rows by eye.
 *
 * The figures describe the whole filtered set, not the page on screen, so the
 * headline does not move as you page through the register.
 */
export function WhtSummaryBar({ summary, loading }: { summary?: WhtSummary; loading?: boolean }) {
  const forms = useMemo(() => summary?.byForm ?? [], [summary])
  if (!summary) return null

  return (
    <div className="space-y-2" aria-busy={loading || undefined}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-card-border bg-card-border sm:grid-cols-4">
        <Cell label="จำนวนหนังสือรับรอง" value={loading ? '—' : summary.count.toLocaleString('th-TH')} />
        <Cell label="ยอดเงิน (ฐานภาษี)" value={loading ? '—' : fmtTHB(summary.amount)} />
        <Cell label="ภาษีที่หักไว้" value={loading ? '—' : fmtTHB(summary.whtAmount)} />
        <Cell
          label="ยื่นแล้ว / ค้าง"
          value={loading ? '—' : `${summary.filedCount} / ${summary.activeCount}`}
          hint={`${summary.vendors} ผู้ขาย`}
        />
      </div>

      {forms.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-card-border bg-white">
          <table className="w-full min-w-[520px] border-collapse text-body">
            <caption className="sr-only">สรุปยอดแยกตามแบบยื่นภาษี</caption>
            <thead>
              <tr className="border-b border-card-border bg-ink-50/80">
                <th scope="col" className="px-3 py-2 text-left text-label font-medium text-ink-500">
                  แบบยื่น
                </th>
                <th scope="col" className="px-3 py-2 text-right text-label font-medium text-ink-500">
                  จำนวน
                </th>
                <th scope="col" className="px-3 py-2 text-right text-label font-medium text-ink-500">
                  ยอดเงิน (ฐานภาษี)
                </th>
                <th scope="col" className="px-3 py-2 text-right text-label font-medium text-ink-500">
                  ภาษีที่หักไว้
                </th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.formType} className="border-b border-card-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {f.label}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-600">{f.count.toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{loading ? '—' : fmtTHB(f.amount)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {loading ? '—' : fmtTHB(f.whtAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-900 bg-ink-50">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  รวมทั้งหมด
                </th>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{summary.count.toLocaleString('th-TH')}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtTHB(summary.amount)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtTHB(summary.whtAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className={emphasis ? 'bg-primary px-4 py-3 text-white' : 'bg-white px-4 py-3'}>
      <p className={emphasis ? 'text-label font-medium text-white/85' : 'text-label text-ink-500'}>{label}</p>
      <p className="mt-0.5 text-title font-semibold tabular-nums">{value}</p>
      {hint && <p className={emphasis ? 'text-micro text-white/75' : 'text-micro text-ink-400'}>{hint}</p>}
    </div>
  )
}
