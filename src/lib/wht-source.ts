import { apiGet, apiSend, hasServer } from './api-client'
import { loadWht, loadWhtByIds, saveWht, type WhtBundle } from './wht-mock'
import { filterWhtByMonth, type WhtRecord, type WhtRecordWithVendor, type WhtVendor } from './wht'
import { matchesSearch } from './search-match'
import { emptyWhtSummary, sortWht, summarizeWht, type WhtSummary } from './wht-summary'
import { parseWhtListQuery, type WhtListQuery } from './wht-list-query'

// Runs on the server when VITE_API_BASE is set, else the local mock store.
//
// Both paths return the same shape, and the summary describes the WHOLE filtered
// set rather than the page on screen. The list previously had no totals at all,
// and a headline that changed as you paged would be worse than none.

export interface WhtListResult {
  records: WhtRecordWithVendor[]
  total: number
  summary?: WhtSummary
}

export function whtSearchFields(r: WhtRecordWithVendor): (string | number | undefined)[] {
  return [r.certificateNo, r.vendorName, r.formType, r.description, r.note, r.id]
}

/** The mock-side reference filter; the server's SQL builder is the other executor. */
export function filterWht(records: WhtRecordWithVendor[], q: WhtListQuery): WhtRecordWithVendor[] {
  // Mirror the server: 0-WHT rows are not certificates to file, and voided /
  // superseded certificates are corrections that stay out of the register.
  let out = records.filter((r) => r.whtAmount > 0 && r.status !== 'void' && r.status !== 'superseded')
  if (q.month) out = filterWhtByMonth(out, q.month)
  if (q.formType) out = out.filter((r) => r.formType === q.formType)
  if (q.status === 'active') out = out.filter((r) => r.status === 'active')
  if (q.status === 'done') out = out.filter((r) => r.status === 'done')
  if (q.q) out = out.filter((r) => matchesSearch(whtSearchFields(r), q.q))
  return out
}

function withVendorNames(bundle: WhtBundle): WhtRecordWithVendor[] {
  const vendorById = new Map<string, WhtVendor>(bundle.vendors.map((v) => [v.id, v]))
  return bundle.records.map((r) => {
    const v = vendorById.get(r.vendorId)
    return { ...r, vendorName: v?.name, vendorTaxId: v?.taxId, vendorAddress: v?.address }
  })
}

export async function fetchWhtList(tenantId: string, q: WhtListQuery, params: URLSearchParams): Promise<WhtListResult> {
  if (hasServer) {
    const res = await apiGet<WhtListResult>(`/api/client/wht/records?${params.toString()}`)
    return { records: res.records ?? [], total: res.total ?? res.records?.length ?? 0, summary: res.summary }
  }

  const matched = sortWht(filterWht(withVendorNames(loadWht(tenantId)), q), q.sort)
  const start = q.limit === 0 ? 0 : q.offset
  const end = q.limit === 0 ? matched.length : start + q.limit
  return { records: matched.slice(start, end), total: matched.length, summary: summarizeWht(matched) }
}

/**
 * Everything matching a scope, unpaged — what the print view renders. Takes the
 * same query params as the list, so "print every certificate for this month" is a
 * URL rather than hundreds of ids.
 */
export async function fetchWhtByScope(tenantId: string, params: URLSearchParams): Promise<WhtRecordWithVendor[]> {
  const q = parseWhtListQuery(params)
  if (hasServer) {
    const p = new URLSearchParams(params)
    p.set('limit', '0')
    return (await apiGet<WhtListResult>(`/api/client/wht/records?${p.toString()}`)).records ?? []
  }
  return sortWht(filterWht(withVendorNames(loadWht(tenantId)), q), q.sort)
}

/** A small explicit selection — the print view's other mode. */
export async function fetchWhtByIds(ids: string[]): Promise<{ records: WhtRecordWithVendor[]; tenantId: string | null }> {
  if (hasServer && ids.length) {
    const res = await apiGet<{ records: WhtRecordWithVendor[] }>(
      `/api/client/wht/records?ids=${encodeURIComponent(ids.join(','))}`,
    )
    return { records: res.records ?? [], tenantId: res.records?.[0]?.tenantId ?? null }
  }
  return loadWhtByIds(ids)
}

/** WHT vendors are only ever read; a certificate references them. */
export async function fetchWhtVendors(tenantId: string): Promise<WhtVendor[]> {
  if (hasServer) return (await apiGet<{ vendors: WhtVendor[] }>('/api/client/wht/vendors')).vendors
  return loadWht(tenantId).vendors
}

/** Mark a certificate as filed, or return it to active. */
export async function setWhtRecordStatus(tenantId: string, id: string, status: 'active' | 'done'): Promise<void> {
  if (hasServer) {
    await apiSend(`/api/client/wht/records/${id}`, 'PATCH', { status })
    return
  }
  const bundle = loadWht(tenantId)
  saveWht({ ...bundle, records: bundle.records.map((r) => (r.id === id ? { ...r, status } : r)) })
}

export { emptyWhtSummary, summarizeWht }
export type { WhtRecordWithVendor }
