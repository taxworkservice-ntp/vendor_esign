export interface AdminTenant {
  id: string
  clientCode: string
  displayName: string
  address: string
  taxId: string
  contactName: string
  status: 'active' | 'suspended'
  beYear: number
  startNumber: number
  txns: number
  receipts: number
  users: number
}

export interface AdminUser {
  id: string
  email: string
  role: 'owner' | 'manager' | 'officer' | 'client_user' | 'client_admin' | 'bookkeeper' | 'super_admin'
  status: 'active' | 'disabled'
  mustChangePw: boolean
}

const TKEY = 'taxwork-admin-tenants-v3'
const UKEY = 'taxwork-admin-users-v3'

function seedTenants(): AdminTenant[] {
  return [
    {
      id: 'ABC', clientCode: 'ABC', displayName: 'บริษัท เอบีซี เซอร์วิส จำกัด',
      address: '', taxId: '', contactName: '', status: 'active',
      beYear: 2569, startNumber: 1, txns: 3, receipts: 1, users: 1,
    },
    {
      id: 'DEMO', clientCode: 'DEMO', displayName: 'บริษัท เดโม เทรดดิ้ง จำกัด',
      address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
      taxId: '0105566000000', contactName: 'คุณเดโม', status: 'active',
      beYear: 2569, startNumber: 1, txns: 3, receipts: 1, users: 2,
    },
  ]
}

function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  const v = fallback()
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch { /* ignore */ }
  return v
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
}

export function loadTenants(): AdminTenant[] {
  return read<AdminTenant[]>(TKEY, seedTenants)
}

export function saveTenants(t: AdminTenant[]) {
  write(TKEY, t)
}

export function loadTenantUsers(): Record<string, AdminUser[]> {
  return read<Record<string, AdminUser[]>>(UKEY, () => ({
    ABC: [{ id: 'u-owner', email: 'owner@abc.co.th', role: 'owner', status: 'active', mustChangePw: false }],
    DEMO: [
      { id: 'u-demo-owner', email: 'owner@demo.co.th', role: 'owner', status: 'active', mustChangePw: false },
      { id: 'u-demo-manager', email: 'manager@demo.co.th', role: 'manager', status: 'active', mustChangePw: false },
      { id: 'u-demo-officer', email: 'officer@demo.co.th', role: 'officer', status: 'active', mustChangePw: true },
    ],
  }))
}

export function saveTenantUsers(v: Record<string, AdminUser[]>) {
  write(UKEY, v)
}

export function mockTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => alphabet[b % alphabet.length]).join('')
}
