import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { requireClient } from './client-auth'
import { decryptId, encryptId } from './crypto'
import type { SessionUser } from './auth'

// ── Client data API (vendors + items) ─────────────────────────────────────
// Session-guarded, workspace-scoped, RLS via withTenant. Mirrors the client
// mock stores (src/lib/vendors-mock.ts, items-mock.ts) so the portal can run on
// the server when VITE_API_BASE is set, and on the mock otherwise.

export const dataRoutes = new Hono()

type Guarded = { error: 401 | 403 } | { u: SessionUser; ws: string }

export async function guard(c: { req: { header: (n: string) => string | undefined } }): Promise<Guarded> {
  const u = await requireClient(c)
  const ws = u?.memberships[0]?.tenantId
  if (!u || !ws) return { error: 401 }
  if (u.mustChangePw) return { error: 403 }
  return { u, ws }
}

function maskTaxId(last4: string): string {
  const d = last4.replace(/\D/g, '').slice(-4)
  return d.length === 4 ? `x-xxxx-xxxxx-${d.slice(0, 2)}-${d.slice(2)}` : 'x-xxxx-xxxxx-••-•'
}

// Encrypt the tax ID; degrade to '' when the key is absent (dev) rather than 500.
function safeEncrypt(taxId: string): string {
  const norm = taxId.replace(/\D/g, '').slice(0, 13)
  if (!norm) return ''
  try {
    return encryptId(norm)
  } catch {
    return ''
  }
}

function decryptLast4(enc: string | null): string {
  if (!enc) return ''
  try {
    const v = decryptId(enc)
    return v ? v.slice(-4) : ''
  } catch {
    return ''
  }
}

function toVendor(r: Record<string, unknown>) {
  const last4 = decryptLast4(r.id_number_encrypted as string | null)
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    name: String(r.name),
    address: String(r.address ?? ''),
    maskedId: maskTaxId(last4),
    taxLast4: last4 || undefined,
    lineUserId: (r.line_user_id as string | null) ?? undefined,
    isVatRegistered: Boolean(r.is_vat_registered),
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
  }
}

dataRoutes.get('/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select id, user_id, name, address, id_number_encrypted, line_user_id, is_vat_registered, created_at
      from vendor_payees where user_id = ${g.ws} order by created_at desc`) as unknown as Record<string, unknown>[]
  })
  return c.json({ vendors: rows.map(toVendor) })
})

dataRoutes.post('/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { name?: string; address?: string; taxId?: string; lineUserId?: string; isVatRegistered?: boolean }
    | null
  const name = (b?.name ?? '').trim()
  if (name.length < 2) return c.json({ error: 'invalid-body' }, 400)
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into vendor_payees (user_id, name, address, id_number_encrypted, line_user_id, is_vat_registered)
      values (${g.ws}, ${name}, ${(b?.address ?? '').trim()}, ${safeEncrypt(b?.taxId ?? '')},
        ${b?.lineUserId?.trim() ?? null}, ${Boolean(b?.isVatRegistered)})
      returning id, user_id, name, address, id_number_encrypted, line_user_id, is_vat_registered, created_at`) as unknown as Record<string, unknown>[]
    return ins[0]
  })
  return c.json({ ok: true, vendor: toVendor(row) })
})

// Full (decrypted) tax ID for a vendor — owner/manager only, for form prefill.
dataRoutes.get('/vendors/:id/tax-id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select id_number_encrypted from vendor_payees where id = ${c.req.param('id')} and user_id = ${g.ws}`) as unknown as { id_number_encrypted: string | null }[]
  })
  const enc = rows[0]?.id_number_encrypted
  let taxId: string | null = null
  if (enc) {
    try {
      taxId = decryptId(enc)
    } catch {
      taxId = null
    }
  }
  return c.json({ taxId })
})

dataRoutes.patch('/vendors/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { name?: string; address?: string; lineUserId?: string; isVatRegistered?: boolean }
    | null
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update vendor_payees set
      name = coalesce(${b?.name ?? null}, name),
      address = coalesce(${b?.address ?? null}, address),
      line_user_id = coalesce(${b?.lineUserId ?? null}, line_user_id),
      is_vat_registered = coalesce(${b?.isVatRegistered ?? null}, is_vat_registered),
      updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})

// ── Items catalog ──

dataRoutes.get('/items', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select id, user_id, name, unit, unit_price, created_at
      from items where user_id = ${g.ws} order by created_at desc`) as unknown as Record<string, unknown>[]
  })
  return c.json({
    items: rows.map((r) => ({
      id: String(r.id), tenantId: String(r.user_id), name: String(r.name),
      unit: String(r.unit ?? 'รายการ'), unitPrice: Number(r.unit_price ?? 0),
      createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
    })),
  })
})

dataRoutes.post('/items', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { name?: string; unit?: string; unitPrice?: number } | null
  const name = (b?.name ?? '').trim()
  if (name.length < 2) return c.json({ error: 'invalid-body' }, 400)
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into items (user_id, name, unit, unit_price)
      values (${g.ws}, ${name}, ${(b?.unit ?? 'รายการ').trim() || 'รายการ'}, ${Math.max(0, Number(b?.unitPrice) || 0)})
      returning id, user_id, name, unit, unit_price, created_at`) as unknown as Record<string, unknown>[]
    return ins[0]
  })
  return c.json({
    ok: true,
    item: { id: String(row.id), tenantId: String(row.user_id), name: String(row.name), unit: String(row.unit), unitPrice: Number(row.unit_price), createdAt: new Date(String(row.created_at)).toISOString() },
  })
})

dataRoutes.patch('/items/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { name?: string; unit?: string; unitPrice?: number } | null
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update items set
      name = coalesce(${b?.name ?? null}, name),
      unit = coalesce(${b?.unit ?? null}, unit),
      unit_price = coalesce(${b?.unitPrice ?? null}, unit_price),
      updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})

dataRoutes.delete('/items/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`delete from items where id = ${c.req.param('id')} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})
