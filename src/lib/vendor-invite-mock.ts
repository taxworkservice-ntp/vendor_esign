import type { VendorInvite } from './vendor-invite'

// localStorage store for vendor invites (mock / preview). Server parity:
// the vendor_invites table. Never used when a backend is wired.

const KEY = 'taxwork-vendor-invites-v1'

export function loadInvites(tenantId?: string): VendorInvite[] {
  let all: VendorInvite[] = []
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) all = JSON.parse(raw) as VendorInvite[]
  } catch {
    /* ignore */
  }
  return tenantId ? all.filter((i) => i.tenantId === tenantId) : all
}

function write(all: VendorInvite[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function saveInvite(invite: VendorInvite) {
  const all = loadInvites()
  const i = all.findIndex((x) => x.id === invite.id)
  if (i >= 0) all[i] = invite
  else all.unshift(invite)
  write(all)
}

export function findInvite(id: string): VendorInvite | undefined {
  return loadInvites().find((i) => i.id === id)
}

export function findInviteByToken(token: string): VendorInvite | undefined {
  return loadInvites().find((i) => i.token === token)
}

export function newInviteId(): string {
  return `vi-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

export function newInviteToken(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
