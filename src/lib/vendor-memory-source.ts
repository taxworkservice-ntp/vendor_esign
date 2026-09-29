import { buildVendorMemory, type VendorMemory } from './vendor-memory'
import { loadTxns } from './mock'

// Port/adapter so the UI is agnostic to whether memory is derived from the
// local mock history or the tenant-scoped server endpoint. Same contract.
// Kill-switch: set VITE_FEATURE_VENDOR_MEMORY=off to disable recall entirely.

const API = (import.meta.env.VITE_API_BASE ?? '') as string
const FLAG = (import.meta.env.VITE_FEATURE_VENDOR_MEMORY ?? 'on') !== 'off'

export interface VendorMemorySource {
  get(vendorId: string): Promise<VendorMemory>
}

export function vendorMemoryEnabled(): boolean {
  return FLAG
}

export function getVendorMemorySource(): VendorMemorySource {
  return API ? httpSource(API) : mockSource()
}

function mockSource(): VendorMemorySource {
  return {
    async get(vendorId) {
      return buildVendorMemory(loadTxns(), vendorId)
    },
  }
}

function httpSource(base: string): VendorMemorySource {
  return {
    async get(vendorId) {
      const r = await fetch(`${base}/api/vendors/${encodeURIComponent(vendorId)}/memory`, { credentials: 'include' })
      const j = (await r.json().catch(() => null)) as (VendorMemory & { error?: string }) | null
      if (!r.ok) throw new Error(j?.error ?? 'request-failed')
      return j as VendorMemory
    },
  }
}
