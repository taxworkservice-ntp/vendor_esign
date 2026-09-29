// Mock client registry for local/testing. Mirrors the tenants table shape used by
// the admin UI. The real backend sources this from `tenants`; here it drives the
// active tenant and receipt series/buyer block so multi-client can be tested.

export interface MockClient {
  id: string
  clientCode: string
  displayName: string
  address: string
  taxId: string
  contactName: string
  beYear: number
  startNumber: number
  status: 'active' | 'suspended'
}

export const MOCK_CLIENTS: MockClient[] = [
  {
    id: 'ABC',
    clientCode: 'ABC',
    displayName: 'บริษัท เอบีซี เซอร์วิส จำกัด',
    address: '199/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000',
    taxId: '0405569000123',
    contactName: 'คุณสมปอง (ผู้จัดการ)',
    beYear: 2569,
    startNumber: 1,
    status: 'active',
  },
  {
    id: 'DEMO',
    clientCode: 'DEMO',
    displayName: 'บริษัท เดโม เทรดดิ้ง จำกัด',
    address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
    taxId: '0105566000000',
    contactName: 'คุณเดโม',
    beYear: 2569,
    startNumber: 1,
    status: 'active',
  },
]

export function clientFor(tenantId: string | undefined): MockClient {
  return MOCK_CLIENTS.find((c) => c.id === tenantId) ?? MOCK_CLIENTS[0]
}
