import { beforeEach, describe, expect, it } from 'vitest'
import { forgetVendorId, recallVendorId, rememberVendorId } from './vendor-id'
import { loadVendors, saveVendor, type ClientVendor } from './vendors-mock'

// Minimal localStorage shim — the derivation reads storage at call time.
class LS {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

const vendor = (id: string): ClientVendor => ({
  id,
  tenantId: 'ABC',
  vendorNo: 1,
  prefix: 'นาย',
  name: 'ทดสอบ',
  address: 'ที่อยู่',
  maskedId: 'x-xxxx-xxxxx-••-•',
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: LS }).localStorage = new LS()
})

describe('vendor tax id recall', () => {
  it('stores the full id encrypted and never in plaintext', async () => {
    saveVendor(vendor('v-test'))
    await rememberVendorId('v-test', '1-2345-67890-12-3')
    expect(await recallVendorId('v-test')).toBe('1234567890123')

    const stored = loadVendors().find((v) => v.id === 'v-test') as ClientVendor
    expect(stored.encryptedId?.startsWith('enc:v1:')).toBe(true)
    expect(stored.taxLast4).toBe('0123')
    expect(JSON.stringify(stored)).not.toContain('1234567890123')
  })

  it('ignores ids that are not 13 digits', async () => {
    saveVendor(vendor('v-bad'))
    await rememberVendorId('v-bad', '12345')
    expect(await recallVendorId('v-bad')).toBeNull()
  })

  it('can forget a remembered id', async () => {
    saveVendor(vendor('v-forget'))
    await rememberVendorId('v-forget', '9999999999999')
    expect(await recallVendorId('v-forget')).toBe('9999999999999')
    forgetVendorId('v-forget')
    expect(await recallVendorId('v-forget')).toBeNull()
    expect(loadVendors().find((v) => v.id === 'v-forget')?.encryptedId).toBeUndefined()
  })
})
