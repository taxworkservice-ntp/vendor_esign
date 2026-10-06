import { inviteUrl } from './app-url'
import { renderInviteMessage, type TenantSettings } from './settings'
import { vendorDisplayName } from './vendor-name'
import { fmtDateTH, fmtTHB } from './format'
import type { PaymentTransaction } from './types'

// Bulk "message to vendors": one text chunk, grouped by vendor and separated by
// a `━━━ <name> ━━━` rule, so the client can select one block and paste it into
// that vendor's LINE chat. Single-item vendors reuse the workspace's invite
// template; multi-item vendors get a numbered list. Kept pure for tests.

const RULE = (name: string) => `━━━━━━━ ${name} ━━━━━━━`

export function buildBulkInviteMessage(rows: PaymentTransaction[], cfg: TenantSettings): string {
  const groups = new Map<string, { prefix?: string; name: string; rows: PaymentTransaction[] }>()
  for (const t of rows) {
    const g = groups.get(t.vendor.id) ?? { prefix: t.vendor.prefix, name: t.vendor.name, rows: [] }
    g.rows.push(t)
    groups.set(t.vendor.id, g)
  }

  const ordered = [...groups.values()].sort((a, b) =>
    vendorDisplayName(a.prefix, a.name).localeCompare(vendorDisplayName(b.prefix, b.name), 'th'),
  )

  const blocks = ordered.map((g) => {
    const title = vendorDisplayName(g.prefix, g.name)
    const items = [...g.rows].sort((a, b) => a.transferDate.localeCompare(b.transferDate))

    if (items.length === 1) {
      const t = items[0]
      return `${RULE(title)}\n${renderInviteMessage(cfg.inviteMessageTemplate, {
        vendor: t.vendor.name,
        vendorPrefix: t.vendor.prefix ?? '',
        date: fmtDateTH(t.transferDate),
        amount: fmtTHB(t.netAmount),
        link: inviteUrl(t.inviteToken),
        client: cfg.displayName,
      })}`
    }

    const lines = items.map(
      (t, i) => `${i + 1}) ${fmtDateTH(t.transferDate)} — ${fmtTHB(t.netAmount)} บาท — ${inviteUrl(t.inviteToken)}`,
    )
    return [
      RULE(title),
      `เรียน ${title}`,
      `แจ้งรายการรอลงนาม ${items.length} รายการ`,
      ...lines,
      '',
      'กรุณาเปิดลิงก์เพื่อลงนามรับเงินและมอบอำนาจออกใบเสร็จ (ลิงก์ใช้ได้จนกว่าจะลงนาม)',
    ].join('\n')
  })

  return blocks.join('\n\n')
}
