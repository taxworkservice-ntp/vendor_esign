import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTxnInput, PaymentTransaction } from '../lib/types'
import { calcWht, isDuplicateSlipRef } from '../lib/config'
import { applyWhtThreshold } from '../lib/wht-calc'
import { loadSettings } from '../lib/settings'
import { itemsSummary, itemsTotal } from '../lib/line-items'
import { normalizeTaxId, taxIdHash, taxIdLast4 } from '../lib/taxid'
import {
  emptyFilters,
  emptyTotals,
  filterTransactions,
  monthsOf,
  sortTransactions,
  summarize,
  type TransactionFilters,
  type TxnTotals,
} from '../lib/txn-filters'
import { EXPORT_LIMIT, pagedQuery, queryFromFilters, queryToParams } from '../lib/txn-list-query'
import { loadTxns, saveTxns } from '../lib/mock'
import { loadVendors } from '../lib/vendors-mock'
import { currentBeYear } from '../lib/settings'
import { nextReceiptNumber } from '../lib/receipt-number'
import { rememberVendorId } from '../lib/vendor-id'
import { generateWhtForTxn } from '../lib/wht-mock'
import { apiGet, apiSend, hasServer } from '../lib/api-client'
import { useClientAuth } from '../lib/client-auth'

const QK = ['transactions'] as const

export interface TxnListResult {
  rows: PaymentTransaction[]
  /** Matching rows across the whole filtered set, not just this page. */
  total: number
  totals: TxnTotals
}

const EMPTY: TxnListResult = { rows: [], total: 0, totals: emptyTotals() }

/** What issuance produced. The mock has no server-issued PDF, so only a number. */
export interface IssueResult {
  number?: string
  verificationCode?: string
  pdfSha256?: string
}

function read(): PaymentTransaction[] {
  return loadTxns()
}
function write(txns: PaymentTransaction[]) {
  saveTxns(txns)
}

/**
 * Runs on the server when VITE_API_BASE is set, else the local mock store.
 *
 * Both paths return the same shape and apply the same filter semantics: the
 * mock through the pure functions in txn-filters.ts, the server through the
 * whitelisted SQL builder. The mock still scopes by month itself so it cannot
 * drift from the server's date handling.
 */
async function fetchList(activeTenant: string, filters: TransactionFilters, page: number, pageSize: number): Promise<TxnListResult> {
  if (hasServer) {
    const q = queryToParams(pagedQuery(filters, page, pageSize))
    const res = await apiGet<{ transactions: PaymentTransaction[]; total: number; totals: TxnTotals }>(
      `/api/client/transactions?${q.toString()}`,
    )
    return { rows: res.transactions, total: res.total, totals: res.totals ?? emptyTotals() }
  }

  const all = read().filter((t) => t.tenantId === activeTenant)
  const matched = sortTransactions(filterTransactions(all, filters), filters.sort)
  // Totals are taken over the WHOLE filtered set before slicing, so the
  // headline figures never describe just the page on screen.
  const totals = summarize(matched)
  const start = page * pageSize
  return { rows: matched.slice(start, start + pageSize), total: matched.length, totals }
}

/** Paged list for the transaction screen. */
export function useTransactions(filters: TransactionFilters = emptyFilters(), page = 0, pageSize = 50) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'list', activeTenant, queryFromFilters(filters), page, pageSize],
    queryFn: () => fetchList(activeTenant, filters, page, pageSize),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not collapse the table into a skeleton.
    placeholderData: keepPreviousData,
  })
}

/**
 * Every row matching the filters, unpaged. Used by Metrics (which must count
 * the whole period, not one page) and by CSV export (a deliberate bulk action).
 */
export function useAllTransactions(filters: TransactionFilters = emptyFilters(), enabled = true) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'all', activeTenant, queryFromFilters(filters)],
    enabled,
    queryFn: async () => {
      if (hasServer) {
        const q = queryToParams({ ...queryFromFilters(filters), limit: EXPORT_LIMIT, offset: 0 })
        const res = await apiGet<{ transactions: PaymentTransaction[] }>(`/api/client/transactions?${q.toString()}`)
        return res.transactions
      }
      const all = read().filter((t) => t.tenantId === activeTenant)
      return sortTransactions(filterTransactions(all, filters), filters.sort)
    },
  })
}

/** Distinct months holding transactions — feeds the global period dropdown. */
export function useTransactionMonths() {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: [...QK, 'months', activeTenant],
    queryFn: async (): Promise<string[]> => {
      if (hasServer) {
        const res = await apiGet<{ months: string[] }>('/api/client/transactions/months')
        return res.months
      }
      return monthsOf(read().filter((t) => t.tenantId === activeTenant))
    },
    // The dropdown must not flicker between tenants; a stale month list is
    // harmless because the bar pins the current month regardless.
    staleTime: 60_000,
  })
}

// Lookup by unique id (receipt/vendor views are id-based).
export function useTransaction(id?: string) {
  return useQuery({
    queryKey: [...QK, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<PaymentTransaction | undefined> => {
      if (hasServer) {
        try {
          return (await apiGet<{ transaction: PaymentTransaction }>(`/api/client/transactions/${id}`)).transaction
        } catch {
          return undefined
        }
      }
      return read().find((t) => t.id === id)
    },
  })
}

/** Slip references already in use, for duplicate detection on the create form. */
export function useAllSlipRefs(): string[] {
  const { activeTenant } = useClientAuth()
  const q = useQuery({
    queryKey: [...QK, 'slips', activeTenant],
    queryFn: async (): Promise<string[]> => {
      if (hasServer) {
        const res = await apiGet<{ refs: string[] }>('/api/client/transactions/slips')
        return res.refs
      }
      return read()
        .filter((t) => t.tenantId === activeTenant)
        .map((t) => t.slipReference)
        .filter(Boolean)
    },
    staleTime: 60_000,
  })
  return q.data ?? []
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  const { activeTenant } = useClientAuth()
  return useMutation({
    mutationFn: async (input: CreateTxnInput) => {
      if (hasServer) {
        const res = await apiSend<{ ok: boolean; id: string }>('/api/client/transactions', 'POST', input)
        return { id: res.id } as PaymentTransaction
      }
      const all = read()
      const slipRef = input.slipReference.trim()
      const inTenant = all.filter((t) => t.tenantId === activeTenant)
      if (slipRef && isDuplicateSlipRef(slipRef, inTenant.map((t) => t.slipReference))) {
        throw new Error('เลขที่อ้างอิงสลิปนี้ถูกใช้แล้ว — โปรดตรวจสอบสลิปซ้ำ')
      }
      const lineItems = input.lineItems
        .map((it) => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
        .filter((it) => it.description && it.amount > 0)
      if (lineItems.length === 0) throw new Error('กรุณาเพิ่มรายการอย่างน้อย 1 บรรทัด')
      const base = itemsTotal(lineItems)
      // มาตรา 50/1 — same rule the server applies, so the mock cannot drift.
      const s = loadSettings(activeTenant)
      const eff = applyWhtThreshold(base, input.whtRate, input.paymentType, s.whtMinThreshold, !!input.forceWht)
      const { gross, wht, net } = calcWht(base, eff.rate, input.whtMode)
      const found = loadVendors(activeTenant).find((v) => v.id === input.vendorId)
      if (!found) throw new Error('กรุณาเลือกผู้ขาย')
      if (found.taxId && normalizeTaxId(found.taxId) !== normalizeTaxId(input.vendorTaxId)) {
        throw new Error('เลขบัตรไม่ตรงกับทะเบียนผู้ขาย — โปรดตรวจสอบอีกครั้ง')
      }
      const vendor = { id: found.id, vendorNo: found.vendorNo, prefix: found.prefix, name: found.name, address: found.address, maskedId: found.maskedId, taxId: found.taxId }
      const id = `TX-${1043 + all.length}`
      const now = new Date().toISOString()
      const note = input.note.trim()
      const txn: PaymentTransaction = {
        id,
        tenantId: activeTenant,
        vendor,
        paymentType: eff.paymentType,
        description: itemsSummary(lineItems, note),
        note,
        lineItems,
        grossAmount: gross,
        whtRate: eff.rate,
        whtMode: input.whtMode,
        whtAmount: wht,
        netAmount: net,
        transferDate: input.transferDate,
        slipReference: slipRef,
        slipName: input.slipName,
        status: 'draft',
        createdAt: now,
        inviteToken: `tok_${Math.random().toString(36).slice(2, 10)}`,
        taxIdHash: await taxIdHash(input.vendorTaxId),
        taxIdLast4: taxIdLast4(input.vendorTaxId),
        // Derived from the timeline so attention logic has one source of truth
        // on the mock path, exactly as the server reads vendor_requests.
        sentAt: undefined,
        timeline: [{ at: now, label: 'สร้างรายการ', detail: 'ธุรกรรมฉบับร่าง' }],
        checks: [
          { key: 'slip', label: slipRef ? 'สลิปตรงยอดสุทธิ' : 'ยังไม่มีสลิป — รอแนบภายหลัง', state: slipRef ? 'pass' : 'warn' },
          { key: 'name', label: 'ชื่อผู้รับตรงกับผู้ขาย', state: 'pass' },
          { key: 'wht', label: 'ภาษีหัก ณ ที่จ่ายตรงตามค่าที่ตั้งไว้', state: 'pass' },
        ],
      }
      write([txn, ...all])
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
  const refresh = () => {
    qc.invalidateQueries({ queryKey: QK })
    qc.invalidateQueries({ queryKey: ['vendor-memory'] })
  }
  const apply = (fn: (all: PaymentTransaction[]) => PaymentTransaction[]) => {
    write(fn(read()))
    refresh()
  }
  // Stamping the send time keeps attention logic fed on the mock path; the
  // server records it in vendor_requests.
  const stampSent = (t: PaymentTransaction, at: string): PaymentTransaction => ({ ...t, sentAt: t.sentAt ?? at })

  return {
    send: async (id: string): Promise<{ token?: string }> => {
      if (hasServer) {
        const res = await apiSend<{ ok: boolean; token?: string }>(`/api/client/transactions/${id}/send`, 'POST')
        refresh()
        return { token: res.token }
      }
      const at = new Date().toISOString()
      let token: string | undefined
      apply((all) =>
        all.map((t) => {
          // Re-activate anything not yet signed (draft, expired, cancelled) so a
          // re-sent link can actually be opened again.
          if (t.id !== id || !['draft', 'expired', 'cancelled'].includes(t.status)) return t
          token = `tok_${Math.random().toString(36).slice(2, 10)}`
          return stampSent(
            { ...t, status: 'sent', inviteToken: token, timeline: [...t.timeline, { at, label: 'ส่งลิงก์ให้ผู้ขาย' }] },
            at,
          )
        }),
      )
      return { token }
    },
    revoke: async (id: string) => {
      if (hasServer) {
        await apiSend(`/api/client/transactions/${id}/revoke`, 'POST')
        refresh()
        return
      }
      apply((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, status: 'cancelled', inviteToken: undefined, timeline: [...t.timeline, { at: new Date().toISOString(), label: 'เพิกถอนลิงก์' }] }
            : t,
        ),
      )
    },
    voidTxn: async (id: string, reason: string) => {
      if (hasServer) {
        await apiSend(`/api/client/transactions/${id}/void`, 'POST', { reason })
        refresh()
        return
      }
      apply((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, status: 'void', voidReason: reason, timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ยกเลิกเอกสาร', detail: reason }] }
            : t,
        ),
      )
    },
    // Finalize: only a signed transaction can be issued. Assigns the receipt
    // number once (never recomputed) and advances the status to 'issued'.
    // The server's response is kept: it carries the verification code and the
    // PDF's SHA-256, which is what the accountant hands over. It used to be
    // discarded, which left the issued artifact unreachable from the UI.
    issue: async (id: string): Promise<IssueResult> => {
      if (hasServer) {
        const res = await apiSend<{ number?: string; verificationCode?: string; pdfSha256?: string }>(
          `/api/transactions/${id}/finalize`,
          'POST',
        )
        refresh()
        qc.invalidateQueries({ queryKey: ['wht'] })
        return {
          number: res.number,
          verificationCode: res.verificationCode,
          pdfSha256: res.pdfSha256,
        }
      }
      const all = read()
      const target = all.find((t) => t.id === id)
      if (!target || target.status !== 'signed') return {}
      const receiptNumber =
        target.receiptNumber ??
        nextReceiptNumber(
          target.vendor.vendorNo ?? 0,
          currentBeYear(),
          all.filter((t) => t.tenantId === target.tenantId && t.id !== id).map((t) => t.receiptNumber),
        )
      apply((rows) =>
        rows.map((t) =>
          t.id === id
            ? {
                ...t,
                status: 'issued',
                receiptNumber,
                timeline: [...t.timeline, { at: new Date().toISOString(), label: 'ออกใบเสร็จ', detail: receiptNumber }],
              }
            : t,
        ),
      )
      // Issuing a receipt with WHT auto-generates the withholding certificate.
      if (target.whtAmount > 0) {
        generateWhtForTxn({ ...target, status: 'issued', receiptNumber })
        qc.invalidateQueries({ queryKey: ['wht'] })
      }
      // The mock has no server-issued PDF, so there is nothing to point at.
      return { number: receiptNumber }
    },
    // Slip is optional at creation and can be attached later. Reference stays
    // unique per tenant (case/space-insensitive), matching the create-time rule.
    attachSlip: async (id: string, input: { slipReference: string; slipName: string }) => {
      if (hasServer) {
        await apiSend(`/api/client/transactions/${id}/slip`, 'POST', input)
        refresh()
        return
      }
      const all = read()
      const target = all.find((t) => t.id === id)
      if (!target) return
      const ref = input.slipReference.trim()
      const others = all
        .filter((t) => t.id !== id && t.tenantId === target.tenantId)
        .map((t) => t.slipReference)
      if (ref && isDuplicateSlipRef(ref, others)) {
        throw new Error('เลขที่อ้างอิงสลิปนี้ถูกใช้แล้ว — โปรดตรวจสอบสลิปซ้ำ')
      }
      apply((rows) =>
        rows.map((t) =>
          t.id === id
            ? {
                ...t,
                slipReference: ref,
                slipName: input.slipName.trim(),
                checks: t.checks.map((c) =>
                  c.key === 'slip'
                    ? { ...c, label: ref ? 'สลิปตรงยอดสุทธิ' : 'ยังไม่มีสลิป — รอแนบภายหลัง', state: ref ? 'pass' : 'warn' }
                    : c,
                ),
                timeline: [...t.timeline, { at: new Date().toISOString(), label: 'แนบเอกสารอ้างอิงสลิป', detail: ref || undefined }],
              }
            : t,
        ),
      )
    },
    refresh,
  }
}

export { EMPTY as EMPTY_TXN_LIST }
