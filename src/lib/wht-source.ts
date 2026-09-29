import { apiGet, hasServer } from './api-client'
import { loadWht, loadWhtByIds, type WhtBundle } from './wht-mock'
import type { WhtRecord, WhtVendor } from './wht'

// Runs on the server when VITE_API_BASE is set, else the local mock store.
export async function fetchWht(tenantId: string): Promise<WhtBundle> {
  if (hasServer) {
    const [v, r] = await Promise.all([
      apiGet<{ vendors: WhtVendor[] }>('/api/client/wht/vendors'),
      apiGet<{ records: WhtRecord[] }>('/api/client/wht/records'),
    ])
    return { vendors: v.vendors, records: r.records }
  }
  return loadWht(tenantId)
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
