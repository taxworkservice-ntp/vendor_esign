import { Hono } from 'hono'
import { sql, withTenant } from '../../src/server/db'
import { requireClient } from './client-auth'
import { impersonationFromCookie, type ImpersonationMode } from './impersonation'
import { decryptId, encryptId } from './crypto'
import { sha256hex } from './auth'
import { readStoredDurable } from './storage'
import { audit } from './shared'
import type { SessionUser } from './auth'
import { isVendorPrefix, prefixRequired } from '../../src/lib/vendor-name'
import { getVendorMemory } from './vendor-memory'

// ── Client data API (vendors + items) ─────────────────────────────────────
// Session-guarded, workspace-scoped, RLS via withTenant. Mirrors the client
// mock stores (src/lib/vendors-mock.ts, items-mock.ts) so the portal can run on
// the server when VITE_API_BASE is set, and on the mock otherwise.

export const dataRoutes = new Hono()

type Guarded =
  | { error: 401 | 403 }
  | { u: SessionUser | null; ws: string; impersonating: boolean; mode: ImpersonationMode; actor: string | null }

/**
 * Session guard for the client portal (port 8787).
 *
 * Tenancy, and nothing else:
 *
 *  - The portal is **tenant-scoped only**. Every authenticated member of a
 *    workspace has full read/write over its vendors, transactions and WHT.
 *    There is deliberately no per-member permission check here: role-based
 *    access control lives in the admin app (port 8788, `admin.ts`), which owns
 *    member management and enforces owner | manager | client_admin.
 *  - `u.memberships[0].tenantId` assumes **one workspace per login**. A user
 *    with memberships in more than one workspace always lands in the first, and
 *    there is no switcher. Fine for the current one-workspace-per-client
 *    deployment, but it is an assumption rather than a capability.
 *  - Row-level security is the real boundary. `withTenant` sets
 *    `app.user_id`, and every policy reduces to `user_id = app_user_id()`.
 *    The `app_is_bookkeeper() OR app_is_super_admin()` clause in those policies
 *    is currently UNREACHABLE: those functions test `app.role`, and no caller
 *    ever passes 'bookkeeper' or 'super_admin' to withTenant. Cross-tenant
 *    access therefore does not exist today, despite what the policy text
 *    implies. See docs/API.md "Roles and tenancy".
 */
export async function guard(c: { req: { header: (n: string) => string | undefined } }): Promise<Guarded> {
  const u = await requireClient(c)
  const ws = u?.memberships[0]?.tenantId
  if (u && ws) {
    if (u.mustChangePw) return { error: 403 }
    return { u, ws, impersonating: false, mode: 'write', actor: u.email }
  }
  // A platform admin "viewing as" a client: honour the signed impersonation
  // cookie. Read-mode writes are rejected by the client-surface middleware.
  const imp = impersonationFromCookie(c.req.header('cookie'))
  if (imp) return { u: null, ws: imp.tenantId, impersonating: true, mode: imp.mode, actor: imp.actor }
  return { error: 401 }
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

function decryptFull(enc: string | null | undefined): string | undefined {
  if (!enc) return undefined
  try {
    return decryptId(enc) ?? undefined
  } catch {
    return undefined
  }
}

function toVendor(r: Record<string, unknown>) {
  const enc = r.id_number_encrypted as string | null
  const last4 = decryptLast4(enc)
  return {
    id: String(r.id),
    tenantId: String(r.user_id),
    vendorNo: Number(r.vendor_no ?? 0),
    prefix: String(r.prefix ?? ''),
    name: String(r.name),
    address: String(r.address ?? ''),
    // The client owns this data: the portal shows the full tax ID (the same value
    // it can already read via /vendors/:id/tax-id). Masking is for the vendor PDF.
    taxId: decryptFull(enc),
    maskedId: maskTaxId(last4),
    taxLast4: last4 || undefined,
    lineUserId: (r.line_user_id as string | null) ?? undefined,
    phone: (r.phone as string | null) ?? undefined,
    email: (r.email as string | null) ?? undefined,
    isVatRegistered: Boolean(r.is_vat_registered),
    isActive: r.is_active === undefined ? true : Boolean(r.is_active),
    hasIdDoc: Boolean(r.id_doc_path),
    hasBankDoc: Boolean(r.bank_doc_path),
    createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
  }
}

dataRoutes.get('/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const includeArchived = c.req.query('includeArchived') === '1'
  // Money context per vendor, in the same query rather than N follow-ups.
  //
  // `outstanding` is what is STILL OWED, so it excludes every settled document:
  // `issued` (the receipt exists — this was the bug: paid vendors showed a
  // balance), plus `cancelled`/`void`. `draft`/`sent`/`opened`/`signed`/`expired`
  // stay in — the vendor still has to be chased. `txn_count` remains the total
  // transaction count (not just the open ones), which is what a bookkeeper scans
  // a supplier register for.
  const rows = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    return (await db.query(
      `select v.id, v.user_id, v.vendor_no, v.prefix, v.name, v.address, v.id_number_encrypted,
              v.line_user_id, v.phone, v.email, v.is_vat_registered, v.is_active, v.created_at,
              v.id_doc_path, v.bank_doc_path,
              coalesce(t.outstanding, 0)::numeric as outstanding,
              coalesce(t.txn_count, 0)::int as txn_count,
              to_char(t.last_activity, 'YYYY-MM-DD') as last_activity
       from vendor_payees v
       left join lateral (
         select
           sum(p.net_amount) filter (where p.status <> 'issued') as outstanding,
           count(*) as txn_count,
           max(p.transfer_date) as last_activity
         from vendor_payables p
         where p.user_id = v.user_id and p.vendor_id = v.id
           and p.status not in ('cancelled', 'void')
       ) t on true
       where v.user_id = $1 ${includeArchived ? '' : 'and v.is_active'}
       order by v.created_at desc`,
      [g.ws],
    )) as unknown as Record<string, unknown>[]
  })
  return c.json({
    vendors: rows.map((r) => ({
      ...toVendor(r),
      outstanding: Number(r.outstanding ?? 0),
      txnCount: Number(r.txn_count ?? 0),
      lastActivity: (r.last_activity as string | null) ?? undefined,
    })),
  })
})

dataRoutes.post('/vendors', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { prefix?: string; name?: string; address?: string; taxId?: string; lineUserId?: string; phone?: string; email?: string; isVatRegistered?: boolean }
    | null
  const prefix = (b?.prefix ?? '').trim()
  const name = (b?.name ?? '').trim()
  if (name.length < 2) return c.json({ error: 'invalid-body' }, 400)
  if (prefixRequired(name) && !isVendorPrefix(prefix)) return c.json({ error: 'invalid-prefix' }, 400)
  const taxNorm = (b?.taxId ?? '').replace(/\D/g, '')
  const taxHash = taxNorm ? sha256hex(taxNorm) : null
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into vendor_payees (user_id, vendor_no, prefix, name, address, id_number_encrypted, id_number_hash, line_user_id, phone, email, is_vat_registered)
      values (${g.ws},
        (select coalesce(max(vendor_no), 0) + 1 from vendor_payees where user_id = ${g.ws}),
        ${isVendorPrefix(prefix) ? prefix : ''}, ${name}, ${(b?.address ?? '').trim()}, ${safeEncrypt(b?.taxId ?? '')}, ${taxHash},
        ${b?.lineUserId?.trim() ?? null}, ${b?.phone?.trim() ?? null}, ${b?.email?.trim() ?? null}, ${Boolean(b?.isVatRegistered)})
      returning id, user_id, vendor_no, prefix, name, address, id_number_encrypted, line_user_id, phone, email, is_vat_registered, created_at`) as unknown as Record<string, unknown>[]
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

// Onboarding documents (ID card / bank-book page) for a vendor. Owner-only and
// audit-logged; streamed through the app, never a public storage URL.
dataRoutes.get('/vendors/:id/document/:kind', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const kind = c.req.param('kind')
  if (kind !== 'id' && kind !== 'bank') return c.json({ error: 'invalid-kind' }, 400)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select id_doc_path, bank_doc_path from vendor_payees
      where id = ${c.req.param('id')} and user_id = ${g.ws}`) as unknown as Record<string, unknown>[]
  })
  const path = kind === 'id' ? rows[0]?.id_doc_path : rows[0]?.bank_doc_path
  const bytes = await readStoredDurable(g.ws, path ? String(path) : null)
  if (!bytes) return c.json({ error: 'not-found' }, 404)
  await withTenant(g.ws, 'owner', async () =>
    audit(g.ws, 'vendor_payees', c.req.param('id'), 'vendor.doc-viewed', g.actor, { kind }, 'server'))
  return c.body(bytes as unknown as ArrayBuffer, 200, { 'Content-Type': 'image/png' })
})

// Remembered defaults for a vendor, derived from this tenant's history — used
// to prefill a new transaction once the vendor is chosen.
dataRoutes.get('/vendors/:id/memory', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  try {
    return c.json(await getVendorMemory(g.ws, c.req.param('id')))
  } catch {
    return c.json({ error: 'unavailable' }, 503)
  }
})

dataRoutes.patch('/vendors/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as
    | { prefix?: string; name?: string; address?: string; lineUserId?: string; phone?: string; email?: string; isVatRegistered?: boolean; idNumber?: string; isActive?: boolean }
    | null
  const nextName = (b?.name ?? '').trim()
  if (b?.name !== undefined && nextName.length < 2) return c.json({ error: 'invalid-body' }, 400)
  if (nextName && prefixRequired(nextName) && b?.prefix !== undefined && !isVendorPrefix(b.prefix.trim()))
    return c.json({ error: 'invalid-prefix' }, 400)
  const nextId = b?.idNumber !== undefined ? b.idNumber.replace(/\D/g, '').slice(0, 13) : undefined
  if (nextId !== undefined && nextId && nextId.length !== 13) return c.json({ error: 'invalid-body' }, 400)
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`update vendor_payees set
      prefix = coalesce(${b?.prefix !== undefined ? (isVendorPrefix(b.prefix.trim()) ? b.prefix.trim() : '') : null}, prefix),
      name = coalesce(${b?.name ?? null}, name),
      address = coalesce(${b?.address ?? null}, address),
      id_number_encrypted = coalesce(${nextId !== undefined ? safeEncrypt(nextId) : null}, id_number_encrypted),
      line_user_id = coalesce(${b?.lineUserId ?? null}, line_user_id),
      phone = coalesce(${b?.phone ?? null}, phone),
      email = coalesce(${b?.email ?? null}, email),
      is_vat_registered = coalesce(${b?.isVatRegistered ?? null}, is_vat_registered),
      is_active = coalesce(${b?.isActive === undefined ? null : Boolean(b.isActive)}, is_active),
      updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})

// Delete a vendor — blocked while any transaction references it, so issued
// receipts and their vendor snapshots stay intact (accounting/audit integrity).
dataRoutes.delete('/vendors/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const id = c.req.param('id')
  const used = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const rows = (await db`select 1 from vendor_payables where vendor_id = ${id} and user_id = ${g.ws} limit 1`) as unknown[]
    return rows.length > 0
  })
  if (used) return c.json({ error: 'vendor-in-use' }, 409)
  await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    await db`delete from vendor_payees where id = ${id} and user_id = ${g.ws}`
  })
  return c.json({ ok: true })
})

// ── Items catalog ──

// The catalogue had no `is_active` in the API even though the column has existed
// since 008 — nothing read it, so there was no way to retire an entry that is
// no longer offered without deleting it. Archived entries drop out of the
// default list and come back with includeArchived=1.
const toItem = (r: Record<string, unknown>) => ({
  id: String(r.id), tenantId: String(r.user_id), itemNo: Number(r.item_no ?? 0), name: String(r.name),
  unit: String(r.unit ?? 'รายการ'), unitPrice: Number(r.unit_price ?? 0),
  isActive: r.is_active === undefined ? true : Boolean(r.is_active),
  createdAt: new Date(String(r.created_at ?? Date.now())).toISOString(),
})

dataRoutes.get('/items', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const includeArchived = c.req.query('includeArchived') === '1'
  const rows = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    return (await db.query(
      `select id, user_id, item_no, name, unit, unit_price, is_active, created_at
       from items where user_id = $1 ${includeArchived ? '' : 'and is_active'}
       order by item_no desc`,
      [g.ws],
    )) as unknown as Record<string, unknown>[]
  })
  return c.json({ items: rows.map(toItem) })
})

dataRoutes.post('/items', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { name?: string; unit?: string; unitPrice?: number } | null
  const name = (b?.name ?? '').trim()
  if (name.length < 2) return c.json({ error: 'invalid-body' }, 400)
  // The catalogue has a unique index on (user_id, lower(name)) — see migration
  // 015. A duplicate service in the catalogue becomes the default line item in
  // new transactions, so this is a real data-quality problem, not a nicety.
  // Report it as a conflict with a message the UI can show verbatim.
  const dup = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    const rows = (await db.query(
      `select name from items where user_id = $1 and lower(name) = lower($2) limit 1`,
      [g.ws, name],
    )) as unknown as { name: string }[]
    return rows[0]?.name
  })
  if (dup) return c.json({ error: 'duplicate-item', existing: dup }, 409)
  const row = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    const ins = (await db`insert into items (user_id, item_no, name, unit, unit_price)
      values (${g.ws},
        (select coalesce(max(item_no), 0) + 1 from items where user_id = ${g.ws}),
        ${name}, ${(b?.unit ?? 'รายการ').trim() || 'รายการ'}, ${Math.max(0, Number(b?.unitPrice) || 0)})
      returning id, user_id, item_no, name, unit, unit_price, is_active, created_at`) as unknown as Record<string, unknown>[]
    return ins[0]
  })
  return c.json({ ok: true, item: toItem(row) })
})

dataRoutes.patch('/items/:id', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { name?: string; unit?: string; unitPrice?: number; isActive?: boolean } | null
  // Renaming can collide with an existing entry, same rule as create.
  if (b?.name) {
    const nextName = b.name.trim()
    if (nextName.length < 2) return c.json({ error: 'invalid-body' }, 400)
    const dup = await withTenant(g.ws, 'client', async () => {
      const db = sql()
      const rows = (await db.query(
        `select name from items where user_id = $1 and lower(name) = lower($2) and id <> $3::uuid limit 1`,
        [g.ws, nextName, c.req.param('id')],
      )) as unknown as { name: string }[]
      return rows[0]?.name
    })
    if (dup) return c.json({ error: 'duplicate-item', existing: dup }, 409)
  }
  await withTenant(g.ws, 'client', async () => {
    const db = sql()
    await db`update items set
      name = coalesce(${b?.name ?? null}, name),
      unit = coalesce(${b?.unit ?? null}, unit),
      unit_price = coalesce(${b?.unitPrice ?? null}, unit_price),
      is_active = coalesce(${b?.isActive === undefined ? null : Boolean(b.isActive)}, is_active),
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
