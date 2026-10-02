import { sql, withTenant } from '../../src/server/db'
import {
  DEFAULT_CONSENT,
  DEFAULT_INVITE_TEMPLATE,
  DEFAULT_WHT_MIN_THRESHOLD,
  DEFAULT_WHT_RATES,
  type TenantSettings,
  type WhtRate,
} from '../../src/lib/settings-types'

// Server-side tenant settings (mirrors src/lib/settings.ts). Reads tenants profile
// columns + the config table. [VERIFY] on first real DB run.

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  return withTenant(tenantId, 'client', async () => {
    const db = sql()
    const tRows = (await db`select client_code, display_name, name, address, tax_id, contact_name, be_year
      from client_profiles where id = ${tenantId}`) as unknown as Record<string, unknown>[]
    const cfg = (await db`select key, value from config where user_id = ${tenantId}`) as unknown as
      { key: string; value: unknown }[]
    const row = tRows[0] ?? {}
    const m = new Map(cfg.map((r) => [r.key, r.value]))
    const ratesRaw = Array.isArray(m.get('wht_rates')) ? (m.get('wht_rates') as Record<string, unknown>[]) : []
    const whtRates: WhtRate[] = ratesRaw.length
      ? ratesRaw.map((r) => ({
          paymentType: String(r.paymentType ?? ''),
          value: Number(r.rate ?? r.value ?? 0),
          label: String(r.label ?? ''),
        }))
      : DEFAULT_WHT_RATES
    return {
      clientCode: String(row.client_code ?? tenantId),
      displayName: String(row.display_name ?? row.name ?? ''),
      address: String(row.address ?? ''),
      taxId: String(row.tax_id ?? ''),
      contactName: String(row.contact_name ?? ''),
      beYear: Number(row.be_year ?? 2569),
      paymentTypes: whtRates.map((r) => r.paymentType),
      whtRates,
      whtMinThreshold: Number(m.get('wht_min_threshold') ?? DEFAULT_WHT_MIN_THRESHOLD),
      linkExpiryDays: Number(m.get('link_expiry_days') ?? 7),
      consentTextV1: String((m.get('consent_text_v1') as { th?: string } | undefined)?.th ?? DEFAULT_CONSENT),
      receiptNote: String(m.get('receipt_note') ?? ''),
      showVerifyQr: Boolean(m.get('show_verify_qr') ?? false),
      inviteMessageTemplate: String(m.get('invite_message_template') ?? DEFAULT_INVITE_TEMPLATE),
      signatureStoragePath: (m.get('signature_storage_path') as string | undefined) || undefined,
      stampStoragePath: (m.get('stamp_storage_path') as string | undefined) || undefined,
    }
  })
}

export async function saveTenantSettings(tenantId: string, s: TenantSettings): Promise<void> {
  await withTenant(tenantId, 'client_admin', async () => {
    const db = sql()
    await db`update client_profiles set display_name = ${s.displayName}, name = ${s.displayName},
      address = ${s.address}, tax_id = ${s.taxId}, contact_name = ${s.contactName},
      client_code = ${s.clientCode}, be_year = ${s.beYear}, updated_at = now()
      where id = ${tenantId}`
    const put = async (key: string, value: unknown) => {
      await db`insert into config (user_id, key, value, updated_at) values (${tenantId}, ${key}, ${JSON.stringify(value)}::jsonb, now())
        on conflict (user_id, key) do update set value = excluded.value, updated_at = now()`
    }
    await put('wht_rates', s.whtRates.map((r) => ({ paymentType: r.paymentType, rate: r.value, label: r.label })))
    await put('payment_types', s.paymentTypes)
    if (s.whtMinThreshold !== undefined) await put('wht_min_threshold', s.whtMinThreshold)
    await put('link_expiry_days', s.linkExpiryDays)
    await put('consent_text_v1', { th: s.consentTextV1 })
    await put('receipt_note', s.receiptNote)
    await put('show_verify_qr', s.showVerifyQr)
    await put('invite_message_template', s.inviteMessageTemplate)
    if (s.signatureStoragePath !== undefined) await put('signature_storage_path', s.signatureStoragePath)
    if (s.stampStoragePath !== undefined) await put('stamp_storage_path', s.stampStoragePath)
  })
}
