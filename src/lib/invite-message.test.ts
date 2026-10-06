import { describe, expect, it } from 'vitest'
import { buildBulkInviteMessage } from './invite-message'
import { DEFAULT_INVITE_TEMPLATE } from './settings-types'
import type { PaymentTransaction } from './types'
import type { TenantSettings } from './settings'

function txn(id: string, vendorId: string, name: string, date: string, net: number, token?: string): PaymentTransaction {
  return {
    id,
    tenantId: 'ABC',
    vendor: { id: vendorId, name, prefix: '', address: '', maskedId: '' },
    description: '',
    note: '',
    lineItems: [],
    grossAmount: net,
    whtRate: 0,
    whtAmount: 0,
    netAmount: net,
    transferDate: date,
    slipReference: '',
    status: 'draft',
    createdAt: date,
    timeline: [],
    inviteToken: token,
  } as unknown as PaymentTransaction
}

const cfg = { inviteMessageTemplate: DEFAULT_INVITE_TEMPLATE, displayName: 'ABC Co' } as TenantSettings

describe('buildBulkInviteMessage', () => {
  it('single vendor + single item uses the invite template', () => {
    const msg = buildBulkInviteMessage([txn('a', 'v1', 'ร้านเจริญพานิช', '2026-10-03', 1800, 'tok1')], cfg)
    expect(msg).toContain('━━━━━━━ ร้านเจริญพานิช ━━━━━━━')
    expect(msg).toContain('เรียน คุณร้านเจริญพานิช')
    expect(msg).toContain('/v/tok1')
  })

  it('single vendor + multiple items lists them numbered', () => {
    const msg = buildBulkInviteMessage(
      [
        txn('a', 'v1', 'ร้านเจริญพานิช', '2026-10-03', 1800, 'tok1'),
        txn('b', 'v1', 'ร้านเจริญพานิช', '2026-10-05', 2400, 'tok2'),
      ],
      cfg,
    )
    expect(msg).toContain('แจ้งรายการรอลงนาม 2 รายการ')
    expect(msg).toContain('1) ')
    expect(msg).toContain('2) ')
    expect(msg).toContain('/v/tok1')
    expect(msg).toContain('/v/tok2')
  })

  it('groups multiple vendors and orders them by name', () => {
    const msg = buildBulkInviteMessage(
      [
        txn('a', 'v1', 'บริษัท ก', '2026-10-03', 1000, 't1'),
        txn('b', 'v2', 'ร้าน ข', '2026-10-04', 2000, 't2'),
      ],
      cfg,
    )
    const iK = msg.indexOf('บริษัท ก')
    const iKh = msg.indexOf('ร้าน ข')
    expect(iK).toBeGreaterThan(-1)
    expect(iKh).toBeGreaterThan(-1)
    // "บริษัท" sorts before "ร้าน" under Thai collation.
    expect(iK).toBeLessThan(iKh)
    expect(msg).toContain('\n\n')
  })
})
