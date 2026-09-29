import { sql, withTenant } from '../../src/server/db'
import type { LineItem } from '../../src/lib/types'
import type { VendorItemStat, VendorLastUsed, VendorMemory } from '../../src/lib/vendor-memory'
import { MEMORY_CATALOG_LIMIT } from '../../src/lib/vendor-memory'

// Server-side vendor memory: same contract as the mock (src/lib/vendor-memory.ts),
// derived from tenant-scoped history under RLS. Read-only and parameterized.
// The excluded-status list is a fixed literal mirroring MEMORY_STATUSES_EXCLUDED
// (constant, not user input) so the query stays index-friendly. Never logs item text.

export async function getVendorMemory(tenantId: string, vendorId: string): Promise<VendorMemory> {
  return withTenant(tenantId, 'client', async () => {
    const db = sql()

    const lastRows = (await db`
      select line_items, note, payment_type, wht_rate, wht_mode
      from vendor_payables
      where user_id = ${tenantId} and vendor_id = ${vendorId}
        and status not in ('draft','void','cancelled')
      order by created_at desc, id desc
      limit 1`) as unknown as
      { line_items: unknown; note: string | null; payment_type: string; wht_rate: string; wht_mode: string | null }[]

    const catalogRows = (await db`
      select it->>'description' as description,
             (array_agg((it->>'amount')::numeric order by t.created_at desc))[1] as last_amount,
             count(*)::int as times_used,
             max(t.created_at) as last_used_at
      from vendor_payables t
      cross join lateral jsonb_array_elements(coalesce(t.line_items, '[]'::jsonb)) it
      where t.user_id = ${tenantId} and t.vendor_id = ${vendorId}
        and t.status not in ('draft','void','cancelled')
        and coalesce(it->>'description', '') <> ''
      group by 1
      order by times_used desc, last_used_at desc
      limit ${MEMORY_CATALOG_LIMIT}`) as unknown as
      { description: string; last_amount: string; times_used: number; last_used_at: string }[]

    const l = lastRows[0]
    const last: VendorLastUsed | null = l
      ? {
          lineItems: toItems(l.line_items),
          paymentType: l.payment_type,
          whtRate: Number(l.wht_rate) || 0,
          whtMode: l.wht_mode === 'grossup' ? 'grossup' : 'deduct',
          note: (l.note ?? '').trim(),
        }
      : null

    const items: VendorItemStat[] = catalogRows.map((r) => ({
      description: String(r.description),
      lastAmount: Number(r.last_amount) || 0,
      timesUsed: Number(r.times_used) || 0,
      lastUsedAt: String(r.last_used_at),
    }))

    return { last, items }
  })
}

function toItems(raw: unknown): LineItem[] {
  return (Array.isArray(raw) ? raw : [])
    .map((it) => {
      const o = it as { description?: unknown; amount?: unknown }
      return { description: String(o.description ?? '').trim(), amount: Number(o.amount) || 0 }
    })
    .filter((it) => it.description && it.amount > 0)
}
