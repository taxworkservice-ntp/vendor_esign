import { PILOT_CONFIG } from './config'
import { clientFor } from './mock-clients'
import { DEFAULT_CONSENT, DEFAULT_INVITE_TEMPLATE, currentBeYear, type TenantSettings } from './settings-types'

// Per-tenant settings runtime: defaults (seed from the current hard-coded
// PILOT_CONFIG so behaviour is unchanged until edited) + a localStorage store.
// Types + validation live in settings-types.ts (importable from the server).
// Server parity: the `config` table + tenants profile columns.

export { DEFAULT_CONSENT, DEFAULT_INVITE_TEMPLATE, currentBeYear, renderInviteMessage, validateSettings, whtRateFor } from './settings-types'
export type { TenantSettings, WhtRate } from './settings-types'

export function defaultSettings(tenantId?: string): TenantSettings {
  const client = clientFor(tenantId)
  return {
    clientCode: client.clientCode,
    displayName: client.displayName,
    address: client.address,
    taxId: client.taxId,
    contactName: client.contactName,
    beYear: currentBeYear(),
    paymentTypes: PILOT_CONFIG.whtRates.map((r) => r.paymentType),
    whtRates: PILOT_CONFIG.whtRates.map((r) => ({ paymentType: r.paymentType, value: r.value, label: r.label })),
    whtMinThreshold: PILOT_CONFIG.whtMinThreshold,
    linkExpiryDays: PILOT_CONFIG.linkExpiryDays,
    consentTextV1: DEFAULT_CONSENT,
    receiptNote: '',
    showVerifyQr: false,
    inviteMessageTemplate: DEFAULT_INVITE_TEMPLATE,
  }
}

const keyFor = (tenantId: string) => `taxwork-settings-${tenantId}`

export function loadSettings(tenantId = 'ABC'): TenantSettings {
  const base = defaultSettings(tenantId)
  try {
    const raw = localStorage.getItem(keyFor(tenantId))
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<TenantSettings>) }
  } catch { /* ignore */ }
  return base
}

export function saveSettings(tenantId: string, settings: TenantSettings): void {
  try {
    localStorage.setItem(keyFor(tenantId), JSON.stringify(settings))
  } catch { /* ignore */ }
}
