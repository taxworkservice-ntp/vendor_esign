import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { sql, withTenant } from '../../src/server/db'
import { guard } from './data'
import { sha256hex } from './auth'
import { audit, one, rateLimited } from './shared'
import { saveBytesDurable, readStoredDurable } from './storage'
import { decryptId, decryptToken, encryptId, encryptToken } from './crypto'
import { INVITE_TTL_DAYS, CONSENT_VERSION } from '../../src/lib/vendor-invite'

// Vendor self-onboarding: a client mints an invite link; the vendor submits
// identity/tax/bank + documents; the client reviews and approves, creating a
// vendor_payees row. Mirrors src/lib/vendor-invite-source.ts (mock).

// ── helpers ────────────────────────────────────────────────────────────
const normTaxId = (s: string) => s.replace(/\D/g, '')

function validTaxIdChecksum(id: string): boolean {
  if (id.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i)
  return ((11 - (sum % 11)) % 10) === Number(id[12])
}

function enc(s: string): string | null {
  try {
    return s ? encryptId(s) : null
  } catch {
    return null
  }
}

function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null
  return new Uint8Array(buf)
}

function namesMatch(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  return n(a) !== '' && n(a) === n(b)
}

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
}

type Row = Record<string, unknown>

function toInvite(r: Row): Record<string, unknown> {
  const taxId = r.tax_id_encrypted ? decryptId(String(r.tax_id_encrypted)) : null
  const bankAccount = r.bank_account_encrypted ? decryptId(String(r.bank_account_encrypted)) : null
  const submitted = r.submitted_at != null
  // A live link past its TTL reads as 'expired' (derived, not stored).
  const storedStatus = String(r.status)
  const expired =
    (storedStatus === 'invited' || storedStatus === 'opened') &&
    new Date(String(r.expires_at)).getTime() < Date.now()
  return {
    id: r.id,
    tenantId: r.user_id,
    status: expired ? 'expired' : storedStatus,
    label: r.label ?? undefined,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    openedAt: r.opened_at ?? undefined,
    submittedAt: r.submitted_at ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined,
    reviewNote: r.review_note ?? undefined,
    duplicateOf: r.duplicate_of ?? undefined,
    bankNameMatch: r.bank_name_match ?? undefined,
    vendorId: r.vendor_id ?? undefined,
    idDocName: r.id_doc_path ? String(r.id_doc_path).split('/').pop() : undefined,
    bankDocName: r.bank_doc_path ? String(r.bank_doc_path).split('/').pop() : undefined,
    consentVersion: r.consent_version ?? undefined,
    draft: submitted
      ? {
          prefix: r.prefix ?? '',
          name: r.name ?? '',
          address: r.address ?? '',
          phone: r.phone ?? undefined,
          email: r.email ?? undefined,
          lineUserId: r.line_user_id ?? undefined,
          taxId: taxId ?? '',
          bankName: r.bank_name ?? '',
          bankAccount: bankAccount ?? '',
          accountHolder: r.account_holder ?? '',
        }
      : undefined,
  }
}

// ── client routes (mounted under /api/client) ──────────────────────────
export const inviteClientRoutes = new Hono()

inviteClientRoutes.get('/vendor-invites', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const rows = await withTenant(g.ws, 'client', async () => {
    const db = sql()
    return (await db.query(
      `select i.*,
         (select v.id from vendor_payees v
            where v.user_id = i.user_id and v.id_number_hash is not null
              and v.id_number_hash = i.tax_id_hash limit 1) as duplicate_of
       from vendor_invites i
       where i.user_id = $1
       order by i.created_at desc`,
      [g.ws],
    )) as unknown as Row[]
  })
  return c.json({ invites: rows.map(toInvite) })
})

inviteClientRoutes.post('/vendor-invites', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const b = (await c.req.json().catch(() => null)) as { label?: string } | null
  const token = randomBytes(32).toString('base64url')
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`insert into vendor_invites (user_id, token_hash, token, label, created_by, expires_at)
      values (${g.ws}, ${sha256hex(token)}, ${encryptToken(token)}, ${b?.label?.trim() ?? null}, ${g.actor}, ${inviteExpiry()})
      returning *`) as unknown as Row[]
    return ins[0]
  })
  return c.json({ invite: { ...toInvite(row), token } })
})

inviteClientRoutes.post('/vendor-invites/:id/resend', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const token = randomBytes(32).toString('base64url')
  const row = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const ins = (await db`update vendor_invites
      set token_hash = ${sha256hex(token)}, token = ${encryptToken(token)},
          expires_at = ${inviteExpiry()}, status = 'invited', updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}
      returning *`) as unknown as Row[]
    return ins[0]
  })
  if (!row) return c.json({ error: 'not-found' }, 404)
  return c.json({ invite: { ...toInvite(row), token } })
})

inviteClientRoutes.post('/vendor-invites/:id/approve', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const id = c.req.param('id')
  const vendorId = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const rows = (await db`select * from vendor_invites where id = ${id} and user_id = ${g.ws}`) as unknown as Row[]
    const inv = rows[0]
    if (!inv) return { error: 'not-found' as const }
    if (inv.status !== 'submitted') return { error: 'not-submitted' as const }
    const ins = (await db`insert into vendor_payees
        (user_id, vendor_no, prefix, name, address, id_number_encrypted, id_number_hash,
         line_user_id, phone, email, bank_name, bank_account_encrypted, account_holder, id_doc_path, bank_doc_path)
      values (${g.ws},
        (select coalesce(max(vendor_no), 0) + 1 from vendor_payees where user_id = ${g.ws}),
        ${inv.prefix ?? ''}, ${inv.name}, ${inv.address}, ${inv.tax_id_encrypted ?? ''}, ${inv.tax_id_hash},
        ${inv.line_user_id}, ${inv.phone}, ${inv.email}, ${inv.bank_name}, ${inv.bank_account_encrypted},
        ${inv.account_holder}, ${inv.id_doc_path}, ${inv.bank_doc_path})
      returning id`) as unknown as Row[]
    const newVendorId = String(ins[0].id)
    await db`update vendor_invites set status = 'approved', vendor_id = ${newVendorId},
      reviewed_at = now(), reviewed_by = ${g.actor}, updated_at = now() where id = ${id} and user_id = ${g.ws}`
    await audit(g.ws, 'vendor_invites', id, 'vendor_invite.approved', g.actor, { vendorId: newVendorId }, 'server')
    return { vendorId: newVendorId }
  })
  if ('error' in vendorId) return c.json({ error: vendorId.error }, vendorId.error === 'not-found' ? 404 : 409)
  return c.json({ ok: true, vendorId: vendorId.vendorId })
})

for (const action of ['reject', 'request-changes'] as const) {
  inviteClientRoutes.post(`/vendor-invites/:id/${action}`, async (c) => {
    const g = await guard(c)
    if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
    const b = (await c.req.json().catch(() => null)) as { note?: string } | null
    const status = action === 'reject' ? 'rejected' : 'changes_requested'
    const ok = await withTenant(g.ws, 'owner', async () => {
      const db = sql()
      const rows = (await db`update vendor_invites set status = ${status}, review_note = ${b?.note?.trim() ?? null},
        reviewed_at = now(), reviewed_by = ${g.actor}, updated_at = now()
        where id = ${c.req.param('id')} and user_id = ${g.ws} returning id`) as unknown as Row[]
      if (rows[0]) await audit(g.ws, 'vendor_invites', c.req.param('id'), `vendor_invite.${status}`, g.actor, {}, 'server')
      return !!rows[0]
    })
    if (!ok) return c.json({ error: 'not-found' }, 404)
    return c.json({ ok: true })
  })
}

// Close an invite the vendor never answered. Distinct from 'expired' (TTL).
inviteClientRoutes.post('/vendor-invites/:id/cancel', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const ok = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    const rows = (await db`update vendor_invites set status = 'cancelled',
      reviewed_at = now(), reviewed_by = ${g.actor}, updated_at = now()
      where id = ${c.req.param('id')} and user_id = ${g.ws}
        and status in ('invited','opened','expired','changes_requested')
      returning id`) as unknown as Row[]
    if (rows[0]) await audit(g.ws, 'vendor_invites', c.req.param('id'), 'vendor_invite.cancelled', g.actor, {}, 'server')
    return !!rows[0]
  })
  if (!ok) return c.json({ error: 'not-found' }, 404)
  return c.json({ ok: true })
})

// Owner-only document proxy (no public presigned URL); access is audit-logged.
inviteClientRoutes.get('/vendor-invites/:id/document/:kind', async (c) => {
  const g = await guard(c)
  if ('error' in g) return c.json({ error: 'unauthorized' }, g.error)
  const kind = c.req.param('kind')
  if (kind !== 'id' && kind !== 'bank') return c.json({ error: 'invalid-kind' }, 400)
  const rows = await withTenant(g.ws, 'owner', async () => {
    const db = sql()
    return (await db`select id_doc_path, bank_doc_path from vendor_invites
      where id = ${c.req.param('id')} and user_id = ${g.ws}`) as unknown as Row[]
  })
  const path = kind === 'id' ? rows[0]?.id_doc_path : rows[0]?.bank_doc_path
  const bytes = await readStoredDurable(g.ws, path ? String(path) : null)
  if (!bytes) return c.json({ error: 'not-found' }, 404)
  await withTenant(g.ws, 'owner', async () =>
    audit(g.ws, 'vendor_invites', c.req.param('id'), 'vendor.doc-viewed', g.actor, { kind }, 'server'))
  return c.body(bytes as unknown as ArrayBuffer, 200, { 'Content-Type': 'image/png' })
})

// ── public routes (mounted at /api/vendor-invite) ──────────────────────
// No session: the token is the credential. Queries run as the DB owner (like
// the vendor-link routes), which bypasses RLS; access is bounded by the token.
export const invitePublicRoutes = new Hono()

invitePublicRoutes.get('/:token', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (await rateLimited(`invite-get:${ip}`, 60)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const db = sql()
  const rows = (await db`select id, status, expires_at, review_note, submitted_at,
      prefix, name, address, phone, email, line_user_id, tax_id_encrypted,
      bank_name, bank_account_encrypted, account_holder
    from vendor_invites where token_hash = ${sha256hex(token)}`) as unknown as Row[]
  const r = one<Row>(rows)
  if (!r) return c.json({ error: 'invalid' }, 404)
  const expired = r.status === 'invited' && new Date(String(r.expires_at)) < new Date()
  const status = expired ? 'expired' : String(r.status)
  if (r.status === 'invited' && !expired) {
    await db`update vendor_invites set status = 'opened', opened_at = coalesce(opened_at, now())
      where id = ${r.id} and status = 'invited'`
  }
  const draft =
    r.submitted_at != null
      ? {
          prefix: r.prefix ?? '',
          name: r.name ?? '',
          address: r.address ?? '',
          phone: r.phone ?? undefined,
          email: r.email ?? undefined,
          lineUserId: r.line_user_id ?? undefined,
          taxId: r.tax_id_encrypted ? decryptId(String(r.tax_id_encrypted)) ?? '' : '',
          bankName: r.bank_name ?? '',
          bankAccount: r.bank_account_encrypted ? decryptId(String(r.bank_account_encrypted)) ?? '' : '',
          accountHolder: r.account_holder ?? '',
        }
      : undefined
  return c.json({ status, reviewNote: r.review_note ?? undefined, expiresAt: r.expires_at, draft })
})

invitePublicRoutes.post('/:token/submit', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'local'
  if (await rateLimited(`invite-submit:${ip}`, 20)) return c.json({ error: 'too-many-requests' }, 429)
  const token = c.req.param('token')
  const b = (await c.req.json().catch(() => null)) as
    | (Record<string, unknown> & { idDocData?: string; bankDocData?: string })
    | null
  if (!b) return c.json({ error: 'invalid-body' }, 400)

  const taxId = normTaxId(String(b.taxId ?? ''))
  const name = String(b.name ?? '').trim()
  const address = String(b.address ?? '').trim()
  const accountHolder = String(b.accountHolder ?? '').trim()
  const bankAccount = String(b.bankAccount ?? '').replace(/\D/g, '')
  if (name.length < 2 || address.length < 4) return c.json({ error: 'invalid-body' }, 400)
  if (!validTaxIdChecksum(taxId)) return c.json({ error: 'invalid-taxid' }, 400)
  if (bankAccount.length < 8 || !accountHolder) return c.json({ error: 'invalid-body' }, 400)
  const idBytes = dataUrlBytes(String(b.idDocData ?? ''))
  const bankBytes = dataUrlBytes(String(b.bankDocData ?? ''))
  if (!idBytes || !bankBytes) return c.json({ error: 'invalid-document' }, 400)

  const db = sql()
  const rows = (await db`select id, user_id, status, expires_at from vendor_invites where token_hash = ${sha256hex(token)}`) as unknown as Row[]
  const inv = rows[0]
  if (!inv) return c.json({ error: 'invalid' }, 404)
  if (inv.status === 'approved' || inv.status === 'rejected') return c.json({ error: 'closed' }, 409)
  if (new Date(String(inv.expires_at)) < new Date() && inv.status !== 'submitted') return c.json({ error: 'expired' }, 409)

  const userId = String(inv.user_id)
  const inviteId = String(inv.id)
  const idPath = await saveBytesDurable('vendor-docs', `${inviteId}-id.png`, idBytes, userId)
  const bankPath = await saveBytesDurable('vendor-docs', `${inviteId}-bank.png`, bankBytes, userId)
  await db`update vendor_invites set
      prefix = ${String(b.prefix ?? '').trim()}, name = ${name}, address = ${address},
      phone = ${String(b.phone ?? '').trim() || null}, email = ${String(b.email ?? '').trim() || null},
      line_user_id = ${String(b.lineUserId ?? '').trim() || null},
      tax_id_encrypted = ${enc(taxId)}, tax_id_hash = ${sha256hex(taxId)},
      bank_name = ${String(b.bankName ?? '').trim()}, bank_account_encrypted = ${enc(bankAccount)},
      account_holder = ${accountHolder}, id_doc_path = ${idPath}, bank_doc_path = ${bankPath},
      bank_name_match = ${namesMatch(accountHolder, name)},
      consent_version = ${String(b.consentVersion ?? CONSENT_VERSION)},
      consented_at = now(), status = 'submitted', submitted_at = now(), updated_at = now()
    where id = ${inviteId} and user_id = ${userId}`
  await audit(userId, 'vendor_invites', inviteId, 'vendor_invite.submitted', 'vendor', {}, ip)
  return c.json({ ok: true })
})

