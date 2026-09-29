import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTxnInput, PaymentTransaction } from '../lib/types'
import { calcWht, isDuplicateSlipRef } from '../lib/config'
import { itemsSummary, itemsTotal } from '../lib/line-items'
import { normalizeTaxId, taxIdHash, taxIdLast4 } from '../lib/taxid'
import { emptyFilters, filterTransactions, sortTransactions, type TransactionFilters } from '../lib/txn-filters'
import { loadTxns, saveTxns } from '../lib/mock'
import { loadVendors } from '../lib/vendors-mock'
import { rememberVendorId } from '../lib/vendor-id'
import { useClientAuth } from '../lib/client-auth'

const QK = ['transactions'] as const

function read(): PaymentTransaction[] {
  return loadTxns()
}
function write(txns: PaymentTransaction[]) {
  saveTxns(txns)
}

export function useTransactions(filters: TransactionFilters = emptyFilters()) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, activeTenant, filters],
    queryFn: async () => {
      const all = read().filter((t) => t.tenantId === activeTenant)
      return sortTransactions(filterTransactions(all, filters), filters.sort)
    },
  })
}

// Lookup by unique id across tenants (receipt/vendor views are id-based).
export function useTransaction(id?: string) {
  return useQuery({
    queryKey: [...QK, 'detail', id],
    enabled: !!id,
    queryFn: async () => read().find((t) => t.id === id),
  })
}

export function useAllSlipRefs() {
  const { activeTenant } = useClientAuth()
  return read()
    .filter((t) => t.tenantId === activeTenant)
    .map((t) => t.slipReference)
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (input: CreateTxnInput) => {
      const all = read()
      const slipRef = input.slipReference.trim()
      const inTenant = all.filter((t) => t.tenantId === activeTenant)
      if (slipRef && isDuplicateSlipRef(slipRef, inTenant.map((t) => t.slipReference))) {
        throw new Error('เลขที่อ้างอิงสลิปนี้ถูกใช้แล้ว — ตรวจสอบสลิปซ้ำ')
      }
      const lineItems = input.lineItems
        .map((it) => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
        .filter((it) => it.description && it.amount > 0)
      if (lineItems.length === 0) throw new Error('กรุณาเพิ่มรายการอย่างน้อย 1 บรรทัด')
      const { gross, wht, net } = calcWht(itemsTotal(lineItems), input.whtRate, input.whtMode)
      const found = loadVendors(activeTenant).find((v) => v.id === input.vendorId)
      if (!found) throw new Error('กรุณาเลือกผู้ขาย')
      // Verify the gate ID against the vendor registry (when known).
      if (found.taxId && normalizeTaxId(found.taxId) !== normalizeTaxId(input.vendorTaxId)) {
        throw new Error('เลขบัตรไม่ตรงกับทะเบียนผู้ขาย — ตรวจสอบอีกครั้ง')
      }
      const vendor = { id: found.id, name: found.name, address: found.address, maskedId: found.maskedId, taxId: found.taxId }
      // Ids are globally unique (sequenced across all tenants).
      const id = `TX-${1043 + all.length}`
      const now = new Date().toISOString()
      const note = input.note.trim()
      const txn: PaymentTransaction = {
        id,
        tenantId: activeTenant,
        vendor,
        paymentType: input.paymentType,
        description: itemsSummary(lineItems, note),
        note,
        lineItems,
        grossAmount: gross,
        whtRate: input.whtRate,
        whtMode: input.whtMode,
        whtAmount: wht,
        netAmount: net,
        transferDate: input.transferDate,
        slipReference: slipRef,
        slipName: input.slipName,
        status: 'draft',
        createdAt: now,
        inviteToken: `tok_${Math.random().toString(36).slice(2, 10)}`,
        // Gate: hash at creation; plaintext never stored.
        taxIdHash: await taxIdHash(input.vendorTaxId),
        taxIdLast4: taxIdLast4(input.vendorTaxId),
        timeline: [{ at: now, label: 'สร้างรายการ', detail: 'ธุรกรรมฉบับร่าง' }],
        checks: [
          { key: 'slip', label: slipRef ? 'สลิปตรงยอดสุทธิ' : 'ยังไม่มีสลิป — รอแนบภายหลัง', state: slipRef ? 'pass' : 'warn' },
          { key: 'name', label: 'ชื่อผู้รับตรงกับผู้ขาย', state: 'pass' },
          { key: 'wht', label: 'WHT ตรงตามค่าที่ตั้งไว้', state: 'pass' },
        ],
      }
      write([txn, ...all])
      // Remember the vendor's tax ID encrypted-at-rest for future recall.
      await rememberVendorId(input.vendorId, input.vendorTaxId)
      return txn
    },
    onSuccess: (_txn, input) => {
      qc.invalidateQueries({ queryKey: QK })
      qc.invalidateQueries({ queryKey: ['vendor-memory'] })
      qc.invalidateQueries({ queryKey: ['vendor-id', input.vendorId] })
    },
  })
}

export function useTransactionActions() {
  const qc = useQueryClient()
  const apply = (fn: (all: PaymentTransaction[]) => PaymentTransaction[]) => {
    write(fn(read()))
    qc.invalidateQueries({ queryKey: QK })
    qc.invalidateQueries({ queryKey: ['vendor-memory'] })
  }
  return {
    send: (id: string) =>
      apply((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, status: 'sent', timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ส่งลิงก์ให้ผู้ขาย' }] }
            : t,
        ),
      ),
    revoke: (id: string) =>
      apply((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, status: 'cancelled', inviteToken: undefined, timeline: [...t.timeline, { at: new Date().toISOString(), label: 'เพิกถอนลิงก์' }] }
            : t,
        ),
      ),
    voidTxn: (id: string, reason: string) =>
      apply((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, status: 'void', voidReason: reason, timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ยกเลิกเอกสาร (void)', detail: reason }] }
            : t,
        ),
      ),
    refresh: () => qc.invalidateQueries({ queryKey: QK }),
  }
}
