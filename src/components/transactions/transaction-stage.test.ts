import { describe, expect, it } from 'vitest'
import { primaryActionFor } from './transaction-stage'
import type { TxnStatus } from '../../lib/types'

describe('primaryActionFor', () => {
  it('maps each status to its one next action', () => {
    const cases: [TxnStatus, string, string][] = [
      ['draft', 'send', 'สร้างลิงก์'],
      ['expired', 'send', 'สร้างลิงก์ใหม่'],
      ['cancelled', 'send', 'สร้างลิงก์ใหม่'],
      ['sent', 'copy', 'คัดลอกลิงก์'],
      ['opened', 'copy', 'คัดลอกลิงก์'],
      ['signed', 'issue', 'ออกใบเสร็จ'],
      ['issued', 'open', 'เปิดใบเสร็จ'],
    ]
    for (const [status, kind, label] of cases) {
      expect(primaryActionFor(status)).toEqual({ kind, label })
    }
  })

  it('has no primary action for a voided document', () => {
    expect(primaryActionFor('void')).toBeNull()
  })
})
