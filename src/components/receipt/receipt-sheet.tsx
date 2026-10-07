import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { SIGNATURE_COPY, type SignatureState } from '../../lib/signature-state'
import { amountToThaiWords } from '../../lib/thai-words'
import { fmtDateTH, fmtDateTimeTHLong, fmtTHB } from '../../lib/format'
import { lineTotal } from '../../lib/line-items'
import { vendorDisplayName } from '../../lib/vendor-name'
import { signMethodLabel } from '../../lib/typed-signature'
import { cn } from '../../lib/cn'
import type { LineItem } from '../../lib/types'

// The one receipt document. Rendered on screen (client + vendor) AND rasterised
// for download, so preview and PDF can never drift. Keep it presentational:
// no data fetching, no routing, no download logic.

export interface ReceiptSheetData {
  number: string
  transferDate: string
  /** Real issuance date (the document date follows transferDate). */
  issueDate?: string
  items: LineItem[]
  grossAmount: number
  whtRate: number
  whtAmount: number
  netAmount: number
  note?: string
  isVoid?: boolean
  voidReason?: string
  client: { displayName: string; address: string; taxId: string }
  vendor: {
    prefix?: string
    name: string
    address: string
    phone?: string
    email?: string
    taxId?: string
    maskedId: string
  }
  sig: SignatureState
  signedAt?: string
  /** How the signature was captured (shown when not a drawn signature). */
  sigMethod?: string
  /** Public verification code, printed so a detached copy stays checkable. */
  verificationCode?: string
  /** Full URL the code resolves to (the public /verify page). */
  verifyUrl?: string
}

const label = 'text-micro font-semibold uppercase tracking-[0.14em] text-ink-400'

export const ReceiptSheet = forwardRef<
  HTMLDivElement,
  { data: ReceiptSheetData; style?: CSSProperties; missingAction?: ReactNode }
>(function ReceiptSheet({ data, style, missingAction }, ref) {
  const { number, items, client, vendor, sig } = data
  const isVoid = data.isVoid
  const whtRate = data.whtRate

  return (
    <div
      ref={ref}
      style={style}
      className="receipt-sheet relative flex flex-col overflow-hidden rounded-card border border-card-border bg-white font-[Sarabun] shadow-card"
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" />
      {isVoid && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rotate-[-18deg] rounded-control border-4 border-danger px-8 py-2 text-4xl font-semibold text-danger/70">VOID</span>
        </div>
      )}

      {/* Header: vendor (left) · document type (right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-title font-semibold leading-snug">{vendorDisplayName(vendor.prefix, vendor.name)}</p>
          <p className="mt-0.5 text-body leading-relaxed text-ink-600">
            <span className="text-ink-400">ที่อยู่: </span>{vendor.address}
          </p>
          {vendor.phone && (
            <p className="mt-0.5 text-label text-ink-600">
              <span className="text-ink-400">โทร: </span>
              <span className="font-mono">{vendor.phone}</span>
            </p>
          )}
          {vendor.email && (
            <p className="mt-0.5 text-label text-ink-600">
              <span className="text-ink-400">อีเมล: </span>
              <span className="font-mono">{vendor.email}</span>
            </p>
          )}
          <p className="mt-0.5 text-label text-ink-600">
            <span className="text-ink-400">เลขบัตรประชาชน: </span>
            <span className="font-mono">{vendor.taxId ?? vendor.maskedId}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-page font-semibold leading-none tracking-tight">ใบเสร็จรับเงิน</h1>
          <p className="mt-1.5 text-micro font-semibold uppercase tracking-[0.2em] text-ink-400">Receipt</p>
          <p className="mt-0.5 text-body font-semibold text-ink-600">ต้นฉบับ</p>
          {/* Same label width on both rows so the values start on the same
              vertical line. */}
          <div className="ml-auto mt-3 w-max space-y-1 text-body">
            <div className="flex items-baseline gap-3">
              <span className="w-16 shrink-0 text-left text-ink-500">เลขที่:</span>
              <span className="text-left font-mono font-semibold">{number}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-16 shrink-0 text-left text-ink-500">วันที่:</span>
              <span className="text-left">{fmtDateTH(data.transferDate)}</span>
            </div>
          </div>
        </div>
      </div>

      <hr className="my-5 border-ink-900" />

      {/* Client (full width) */}
      <div className="rounded-control bg-ink-50 p-3.5 text-body">
        <p className={label}>ผู้ซื้อ</p>
        <p className="mt-1.5 font-semibold">{client.displayName}</p>
        <p className="mt-0.5 text-body leading-relaxed text-ink-600">
          <span className="text-ink-400">ที่อยู่: </span>{client.address}
        </p>
        <p className="mt-0.5 text-label text-ink-600">
          <span className="text-ink-400">เลขประจำตัวผู้เสียภาษี: </span>
          <span className="font-mono">{client.taxId}</span>
        </p>
      </div>

      {data.note && <p className="mt-4 text-body text-ink-500">{data.note}</p>}

      {/* Items */}
      <div className="mt-5 text-bodySm">
        <div className="flex items-baseline gap-2 border-b border-ink-900 pb-1.5">
          <span className={`${label} w-6 shrink-0`}>#</span>
          <span className={label}>รายละเอียด</span>
          <span className={`${label} ml-auto w-14 shrink-0 text-right`}>จำนวน</span>
          <span className={`${label} w-16 shrink-0 text-right`}>หน่วย</span>
          <span className={`${label} w-24 shrink-0 text-right`}>ราคา/หน่วย</span>
          <span className={`${label} w-20 shrink-0 text-right`}>ส่วนลด</span>
          <span className={`${label} w-24 shrink-0 text-right`}>จำนวนเงิน</span>
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex items-baseline gap-2 border-b border-card-border py-1.5 last:border-0">
            <span className="w-6 shrink-0 text-left font-mono text-label text-ink-400">{i + 1}</span>
            <span className="min-w-0 flex-1 leading-snug">{it.description}</span>
            <span className="w-14 shrink-0 text-right tabular-nums">{it.quantity ?? 1}</span>
            <span className="w-16 shrink-0 text-right text-ink-600">{it.unit || 'รายการ'}</span>
            <span className="w-24 shrink-0 text-right tabular-nums">{fmtTHB(it.unitPrice ?? it.amount)}</span>
            <span className="w-20 shrink-0 text-right tabular-nums text-ink-500">
              {it.discount ? `${fmtTHB(it.discount)}` : '—'}
            </span>
            <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmtTHB(lineTotal(it))}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="mt-5 text-body">
        <div className="flex justify-between py-1">
          <span className="text-ink-500">รวมเป็นเงิน</span>
          <span className="font-semibold tabular-nums">{fmtTHB(data.grossAmount)}</span>
        </div>
        {whtRate > 0 && (
          <div className="flex justify-between py-1">
            <span className="text-ink-500">หักภาษี ณ ที่จ่าย {whtRate}%</span>
            <span className="tabular-nums text-ink-500">- {fmtTHB(data.whtAmount)}</span>
          </div>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink-900 pt-2.5">
          <span className="font-semibold">ยอดรับสุทธิ</span>
          <span className="text-xl font-semibold tabular-nums">{fmtTHB(data.netAmount)}</span>
        </div>
        <p className="mt-1.5 text-body text-ink-500">({amountToThaiWords(data.netAmount)})</p>
        {/* Issuance remark: the document date is the payment date, so the real
            issuance date is stated here. */}
        {data.issueDate && (
          <p className="mt-2 text-label text-ink-400">เอกสารฉบับนี้ออกเมื่อ {fmtDateTH(data.issueDate.slice(0, 10))}</p>
        )}
      </div>

      {isVoid && <p className="mt-4 text-label text-ink-400">ยกเลิกเอกสาร: {data.voidReason}</p>}

      {/* Signature block — each state says what is actually true. */}
      <div className="mt-auto flex justify-center pt-6">
        {sig.kind === 'unsigned' ? (
          <div className="w-[260px] text-center">
            <div className="flex h-14 items-center justify-center text-label text-ink-400">
              {SIGNATURE_COPY.unsigned.title}
            </div>
            <p className="text-label text-ink-400">{SIGNATURE_COPY.unsigned.detail}</p>
          </div>
        ) : sig.kind === 'loading' ? (
          <div className="w-[260px] text-center">
            <div className="flex h-14 items-center justify-center gap-2 text-label text-ink-400">
              <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-ink-100" aria-hidden />
              {SIGNATURE_COPY.loading.title}
            </div>
          </div>
        ) : sig.kind === 'missing' ? (
          <div className="w-[300px] text-center">
            <div className="flex h-14 items-center justify-center">
              <FileText size={22} className="text-ink-300" aria-hidden />
            </div>
            <p className="text-body font-semibold text-warning">{SIGNATURE_COPY.missing.title}</p>
            <p className="mt-0.5 text-label text-ink-500">{SIGNATURE_COPY.missing.detail}</p>
            {missingAction}
          </div>
        ) : (
          <div className="w-[320px] max-w-full text-center">
            <div className="flex h-14 items-end justify-center">
              <img
                src={sig.png}
                alt="ลายเซ็นผู้มีอำนาจลงนาม"
                data-role="overlay"
                className={cn(
                  'mx-auto block min-w-0 max-w-full object-contain',
                  data.sigMethod === 'typed-consent' ? 'max-h-7' : 'max-h-14',
                )}
              />
            </div>
            <p className="border-t border-ink-300 pt-2 text-body font-semibold">ผู้มีอำนาจลงนาม</p>
            <p className="text-label text-ink-400">{vendorDisplayName(vendor.prefix, vendor.name)}</p>
            {data.signedAt && (
              <p className="mt-0.5 text-micro leading-tight text-ink-400">
                ลงนามเมื่อ {fmtDateTimeTHLong(data.signedAt)}
                {data.sigMethod ? ` · ${signMethodLabel(data.sigMethod)}` : ''}
              </p>
            )}
            {data.sigMethod === 'typed-consent' && (
              <p className="mt-0.5 text-micro leading-tight text-ink-400">
                ลายมือชื่ออิเล็กทรอนิกส์ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
              </p>
            )}
          </div>
        )}
      </div>

      {/* Document footer — the public verification record, kept out of the
          signature block so the signature stays clean and the page compact. */}
      {data.verificationCode && (
        <div className="mt-6 border-t border-card-border pt-2 text-center text-micro leading-tight text-ink-400">
          <p>
            รหัสตรวจสอบ <span className="font-mono font-semibold">{data.verificationCode}</span>
            {data.verifyUrl && <span className="break-all"> · {data.verifyUrl}</span>}
          </p>
        </div>
      )}
    </div>
  )
})
