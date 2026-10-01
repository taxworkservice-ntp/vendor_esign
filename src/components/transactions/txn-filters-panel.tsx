import { X } from 'lucide-react'
import type { ClientVendor } from '../../lib/vendors-mock'
import type { PresetId, SlipFilter, StatusFilter, TransactionFilters } from '../../lib/txn-filters'
import { statusLabel } from '../../lib/txn-filters'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { FilterChip } from '../ui/filter-chip'
import { VendorPicker } from '../vendor-picker'

// The advanced filter panel. Every control here is h-10 — the previous version
// mixed h-9 (dates) and h-10 (amounts) against the h-11 default elsewhere,
// which made the panel look broken next to the toolbar.

const FIELD = 'mb-1.5 text-label font-semibold text-ink-500'
const NUM = 'h-10 tabular-nums'

const PRESETS: { id: PresetId; th: string }[] = [
  { id: '7d', th: '7 วัน' },
  { id: '30d', th: '30 วัน' },
  { id: 'month', th: 'เดือนนี้' },
  { id: 'year', th: 'ปีนี้' },
]

const SLIP_CHIPS: { v: SlipFilter; th: string }[] = [
  { v: 'all', th: 'ทั้งหมด' },
  { v: 'with', th: 'มีสลิป' },
  { v: 'without', th: 'ยังไม่แนบ' },
]

const EXACT_STATUSES: StatusFilter[] = ['draft', 'sent', 'opened', 'signed', 'issued', 'expired', 'void', 'cancelled']

export function TxnFiltersPanel({
  filters,
  paymentTypes,
  vendors,
  onPatch,
  onRange,
  onPreset,
  onClearAll,
  id,
}: {
  filters: TransactionFilters
  paymentTypes: string[]
  vendors: ClientVendor[]
  onPatch: (patch: Partial<TransactionFilters>) => void
  /** Range edits clear the global month — they are mutually exclusive. */
  onRange: (patch: Partial<TransactionFilters>) => void
  onPreset: (id: PresetId) => void
  onClearAll: () => void
  id?: string
}) {
  return (
    <div id={id} className="grid gap-4 border-t border-card-border pt-4 md:grid-cols-2 xl:grid-cols-4">
      <div>
        <p className={FIELD}>สถานะ (ละเอียด)</p>
        <Select
          value={filters.status}
          onChange={(e) => onPatch({ status: e.target.value as StatusFilter })}
          aria-label="กรองตามสถานะละเอียด"
        >
          <option value="all">{statusLabel('all')}</option>
          <optgroup label="กลุ่มสถานะ">
            <option value="active">{statusLabel('active')}</option>
            <option value="done">{statusLabel('done')}</option>
            <option value="voided">{statusLabel('voided')}</option>
          </optgroup>
          <optgroup label="สถานะเดี่ยว">
            {EXACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </optgroup>
        </Select>
      </div>

      <div className="xl:col-span-2">
        <p className={FIELD}>ช่วงวันที่โอน</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <FilterChip key={p.id} onClick={() => onPreset(p.id)}>
              {p.th}
            </FilterChip>
          ))}
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => onRange({ from: e.target.value })}
            aria-label="ตั้งแต่วันที่"
            className="h-10 w-auto"
          />
          <span className="text-ink-400" aria-hidden>
            –
          </span>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => onRange({ to: e.target.value })}
            aria-label="ถึงวันที่"
            className="h-10 w-auto"
          />
        </div>
        {(filters.from || filters.to) && (
          <p className="mt-1.5 text-label text-ink-500">
            ใช้กับหน้านี้เท่านั้น — รอบเดือนของหน้าอื่น (ภาษีหัก ณ ที่จ่าย / ภาพรวม) ยังคงเดิม
          </p>
        )}
      </div>

      <div>
        <p className={FIELD}>ประเภทการจ่าย</p>
        <Select
          value={filters.paymentType}
          onChange={(e) => onPatch({ paymentType: e.target.value })}
          aria-label="กรองตามประเภทการจ่าย"
        >
          <option value="">ทั้งหมด</option>
          {paymentTypes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className={FIELD}>สลิป</p>
        <div className="flex gap-1.5" role="group" aria-label="กรองตามการมีสลิป">
          {SLIP_CHIPS.map((c) => (
            <FilterChip
              key={c.v}
              active={filters.slip === c.v}
              onClick={() => onPatch({ slip: c.v })}
              className="flex-1 justify-center"
            >
              {c.th}
            </FilterChip>
          ))}
        </div>
      </div>

      <div>
        <p className={FIELD}>ยอดสุทธิ (บาท)</p>
        <div className="flex items-center gap-1.5">
          <Input
            inputMode="decimal"
            placeholder="ต่ำสุด"
            value={filters.minNet}
            onChange={(e) => onPatch({ minNet: e.target.value })}
            aria-label="ยอดสุทธิต่ำสุด"
            className={NUM}
          />
          <span className="text-ink-400" aria-hidden>
            –
          </span>
          <Input
            inputMode="decimal"
            placeholder="สูงสุด"
            value={filters.maxNet}
            onChange={(e) => onPatch({ maxNet: e.target.value })}
            aria-label="ยอดสุทธิสูงสุด"
            className={NUM}
          />
        </div>
      </div>

      <div className="xl:col-span-2">
        <p className={FIELD}>ผู้ขาย</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <VendorPicker
              vendors={vendors}
              value={filters.vendorId || undefined}
              onChange={(id) => onPatch({ vendorId: id })}
              allowAdd={false}
              compact
            />
          </div>
          {filters.vendorId && (
            <button
              type="button"
              onClick={() => onPatch({ vendorId: '' })}
              className="shrink-0 rounded-control px-2.5 py-2 text-body font-semibold text-ink-600 transition hover:bg-ink-100"
            >
              ล้าง
            </button>
          )}
        </div>
      </div>

      <div className="flex items-end xl:col-span-2">
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-body font-semibold text-ink-600 transition hover:bg-ink-100"
        >
          <X size={14} aria-hidden /> ล้างตัวกรองทั้งหมด
        </button>
      </div>
    </div>
  )
}
