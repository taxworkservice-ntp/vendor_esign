import { apiGet, hasServer } from './api-client'
import { loadWht, loadWhtByIds, type WhtBundle } from './wht-mock'
import { filterWhtByMonth } from './wht'
import type { WhtRecord, WhtVendor } from './wht'

// Runs on the server when VITE_API_BASE is set, else the local mock store.
// Month is enforced server-side (issue_date range) AND client-side so both
// paths stay identical.
export async function fetchWht(tenantId: string, month?: string): Promise<WhtBundle> {
  if (hasServer) {
    const q = month ? `?month=${encodeURIComponent(month)}` : ''
    const [v, r] = await Promise.all([
      apiGet<{ vendors: WhtVendor[] }>('/api/client/wht/vendors'),
      apiGet<{ records: WhtRecord[] }>(`/api/client/wht/records${q}`),
    ])
    return { vendors: v.vendors, records: r.records }
  }
  const bundle = loadWht(tenantId)
  if (!month) return bundle
  return { ...bundle, records: filterWhtByMonth(bundle.records, month) }
}

export async function fetchWhtByIds(
  ids: string[],
): Promise<{ records: (WhtRecord & { vendor?: WhtVendor })[]; tenantId: string | null }> {
  if (hasServer && ids.length) {
    const [{ records }, { vendors }] = await Promise.all([
      apiGet<{ records: WhtRecord[] }>(`/api/client/wht/records?ids=${encodeURIComponent(ids.join(','))}`),
      apiGet<{ vendors: WhtVendor[] }>('/api/client/wht/vendors'),
    ])
    const withVendor = records.map((r) => ({ ...r, vendor: vendors.find((v) => v.id === r.vendorId) }))
    return { records: withVendor, tenantId: withVendor[0]?.tenantId ?? null }
  }
  return loadWhtByIds(ids)
}
