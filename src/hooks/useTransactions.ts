import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTxnInput, PaymentTransaction } from '../lib/types'
import { calcWht, isDuplicateSlipRef } from '../lib/config'
import { taxIdHash, taxIdLast4 } from '../lib/taxid'
import { loadTxns, saveTxns, VENDORS } from '../lib/mock'

const QK = ['transactions'] as const

function read(): PaymentTransaction[] {
  return loadTxns()
}
function write(txns: PaymentTransaction[]) {
  saveTxns(txns)
}

export function useTransactions(search = '', status = 'all') {
  return useQuery({
    queryKey: [...QK, search, status],
    queryFn: async () => {
      const all = read()
      return all.filter(
        (t) =>
          (status === 'all' || t.status === status) &&
          (!search ||
            t.vendor.name.includes(search) ||
            t.description.includes(search) ||
            t.id.toLowerCase().includes(search.toLowerCase())),
      )
    },
  })
}

export function useTransaction(id?: string) {
  return useQuery({
    queryKey: [...QK, 'detail', id],
    enabled: !!id,
    queryFn: async () => read().find((t) => t.id === id),
  })
}

export function useAllSlipRefs() {
  return read().map((t) => t.slipReference)
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTxnInput) => {
      const all = read()
      const slipRef = input.slipReference.trim()
      if (slipRef && isDuplicateSlipRef(slipRef, all.map((t) => t.slipReference))) {
        throw new Error('เลขที่อ้างอิงสลิปนี้ถูกใช้แล้ว — ตรวจสอบสลิปซ้ำ')
      }
      const { wht, net } = calcWht(input.grossAmount, input.whtRate)
      const vendor = VENDORS.find((v) => v.id === input.vendorId)!
      const id = `TX-${1043 + all.length}`
      const now = new Date().toISOString()
      const txn: PaymentTransaction = {
        id,
        vendor,
        paymentType: input.paymentType,
        description: input.description,
        grossAmount: input.grossAmount,
        whtRate: input.whtRate,
        whtAmount: wht,
        netAmount: net,
        transferDate: input.transferDate,
        slipReference: input.slipReference.trim(),
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
          { key: 'wht', label: 'WHT ตรงตาม config', state: 'pass' },
        ],
      }
      write([txn, ...all])
      return txn
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useTransactionActions() {
  const qc = useQueryClient()
  const apply = (fn: (all: PaymentTransaction[]) => PaymentTransaction[]) => {
    write(fn(read()))
    qc.invalidateQueries({ queryKey: QK })
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
