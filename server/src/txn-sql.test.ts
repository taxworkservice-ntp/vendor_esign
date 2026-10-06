import { describe, expect, it } from 'vitest'
import { limitClause, orderByClause, totalsClause, whereClause } from './txn-sql'
import { parseListQuery, type TxnListQuery } from '../../src/lib/txn-list-query'
import { NON_PAYABLE, type SortKey } from '../../src/lib/txn-filters'

const q = (s: string, page?: { limit: number; offset: number }): TxnListQuery => {
  const sp = new URLSearchParams(s)
  if (page) {
    sp.set('limit', String(page.limit))
    sp.set('offset', String(page.offset))
  }
  return parseListQuery(sp)
}

const USER = 'ws-abc'

describe('orderByClause', () => {
  it('maps every sort field to its column', () => {
    const cases: [SortKey, string][] = [
      ['date-desc', 'p.transfer_date desc'],
      ['date-asc', 'p.transfer_date asc'],
      ['gross-desc', 'p.gross_amount desc'],
      ['wht-asc', 'p.wht_amount asc'],
      ['net-desc', 'p.net_amount desc'],
      ['vendor-asc', 'v.name asc'],
      ['status-desc', 'p.status desc'],
    ]
    for (const [key, expected] of cases) {
      expect(orderByClause(key)).toBe(`order by ${expected}, p.id asc`)
    }
  })

  it('always appends the id tiebreaker so paging is deterministic', () => {
    for (const key of ['date-desc', 'net-asc', 'vendor-desc', 'status-asc'] as SortKey[]) {
      expect(orderByClause(key).endsWith(', p.id asc')).toBe(true)
    }
  })

  it('orders the maker queue by urgency rank, oldest activity first', () => {
    const sql = orderByClause('urgency-desc')
    expect(sql).toContain("p.status = 'expired'")
    expect(sql).toContain('p.id asc')
    const reverse = orderByClause('urgency-asc')
    expect(reverse).not.toBe(sql)
  })
})

describe('limitClause', () => {
  it('renders limit and offset', () => {
    expect(limitClause(q('', { limit: 50, offset: 100 }))).toBe('limit 50 offset 100')
  })

  it('omits paging entirely for the export sentinel', () => {
    expect(limitClause(q('limit=0'))).toBe('')
  })
})

describe('whereClause — safety', () => {
  it('never interpolates a value into the SQL text', () => {
    const w = whereClause(q('q=%27%3B%20drop%20table%20x%3B--&status=active&type=a%27b&vendor=v1&min=5'), USER)
    expect(w.text).not.toContain('drop table')
    expect(w.text).not.toContain('a%27b')
    // Everything user-supplied went through the params array.
    expect(w.params).toContain('%\'; drop table x;--%')
    expect(w.params).toContain("a'b")
  })

  it('scopes to the tenant as the first binding', () => {
    const w = whereClause(q('status=sent'), USER)
    expect(w.text).toContain('p.user_id = $1')
    expect(w.params[0]).toBe(USER)
  })

  it('escapes LIKE metacharacters so a wildcard cannot match everything', () => {
    const w = whereClause(q('q=%25'), USER)
    expect(w.params.some((p) => typeof p === 'string' && p.includes('\\%'))).toBe(true)
    const u = whereClause(q('q=_x_'), USER)
    expect(u.params.some((p) => typeof p === 'string' && p.includes('\\_'))).toBe(true)
  })

  it('escapes a backslash in the search term', () => {
    const w = whereClause(q('q=a%5Cb'), USER)
    expect(w.params.some((p) => typeof p === 'string' && p.includes('\\\\'))).toBe(true)
  })
})

describe('whereClause — filters', () => {
  it('is just the tenant scope for an unfiltered query', () => {
    const w = whereClause(q(''), USER)
    expect(w.text.trim()).toBe('p.user_id = $1')
    expect(w.params).toEqual([USER])
  })

  it('expands a status group into bound statuses', () => {
    const w = whereClause(q('status=active'), USER)
    expect(w.text).toMatch(/p\.status in \(\$2, \$3, \$4, \$5\)/)
    expect(w.params.slice(1)).toEqual(['draft', 'sent', 'opened', 'signed'])
  })

  it('expands the voided group', () => {
    const w = whereClause(q('status=voided'), USER)
    expect(w.params.slice(1)).toEqual(['void', 'cancelled'])
  })

  it('turns a month into an inclusive date range', () => {
    const w = whereClause(q('month=2026-02'), USER)
    expect(w.text).toContain('p.transfer_date >= $2')
    expect(w.text).toContain('p.transfer_date <= $3')
    expect(w.params[1]).toBe('2026-02-01')
    expect(w.params[2]).toBe('2026-02-28')
  })

  it('handles a December month without rolling the year wrong', () => {
    const w = whereClause(q('month=2026-12'), USER)
    expect(w.params[1]).toBe('2026-12-01')
    expect(w.params[2]).toBe('2026-12-31')
  })

  it('uses from/to when there is no month', () => {
    const w = whereClause(q('from=2026-09-01&to=2026-09-30'), USER)
    expect(w.text).toContain('p.transfer_date >= $2')
    expect(w.text).toContain('p.transfer_date <= $3')
    expect(w.params.slice(1)).toEqual(['2026-09-01', '2026-09-30'])
  })

  it('never applies a month and a range together', () => {
    const w = whereClause(q('month=2026-09&from=2026-01-01'), USER)
    expect(w.params.filter((p) => p === '2026-01-01')).toHaveLength(0)
  })

  it('filters slip presence', () => {
    expect(whereClause(q('slip=with'), USER).text).toContain("p.slip_reference <> ''")
    expect(whereClause(q('slip=without'), USER).text).toContain("p.slip_reference = ''")
  })

  it('binds amount bounds as numbers and ignores unparseable ones', () => {
    const w = whereClause(q('min=100&max=9000'), USER)
    expect(w.params.slice(1)).toEqual([100, 9000])
    const bad = whereClause(q('min=abc&max=xyz'), USER)
    expect(bad.text).not.toContain('net_amount')
  })

  it('casts the vendor uuid for comparison', () => {
    const w = whereClause(q('vendor=abc-123'), USER)
    expect(w.text).toContain('p.vendor_id::text = $2')
    expect(w.params[1]).toBe('abc-123')
  })

  it('searches across vendor (incl. title), description, note, id, ref and slip', () => {
    const w = whereClause(q('q=สมชาย'), USER)
    for (const col of ['v.name', 'v.prefix', 'p.description', 'p.note', 'p.ref', 'p.slip_reference']) {
      expect(w.text).toContain(`${col} ilike`)
    }
    expect(w.text).toContain('vendor_receipts')
    // The title is matched alone and combined with the name.
    expect(w.text).toContain("(v.prefix || ' ' || v.name) ilike")
    expect(w.text).toContain("replace(v.prefix || ' ' || v.name, ' ', '') ilike")
    // p.id is a uuid, so it must be cast before a text operator is applied —
    // otherwise the whole list request 500s as soon as anyone types.
    expect(w.text).toContain('p.id::text ilike')
  })
})

describe('totalsClause', () => {
  it('returns count, sums, payable sums and the voided count', () => {
    const t = totalsClause(q(''), USER)
    for (const alias of [
      'as count', 'as gross', 'as wht', 'as net',
      'as payable_count', 'as payable_gross', 'as payable_wht', 'as payable_net', 'as voided_count',
    ]) {
      expect(t.text).toContain(alias)
    }
  })

  it('binds the non-payable statuses first so the filter placeholders resolve', () => {
    const t = totalsClause(q('status=active'), USER)
    expect(t.params.slice(0, NON_PAYABLE.length)).toEqual(NON_PAYABLE)
    // Tenant scope comes right after the seeded statuses.
    expect(t.params[NON_PAYABLE.length]).toBe(USER)
    expect(t.text).toContain(`p.user_id = $${NON_PAYABLE.length + 1}`)
  })

  it('excludes exactly the non-payable statuses from the payable sums', () => {
    const t = totalsClause(q(''), USER)
    const keep = t.text.match(/p\.status not in \(([^)]*)\)/)?.[1]
    const drop = t.text.match(/p\.status in \(([^)]*)\)/)?.[1]
    expect(keep).toBe(drop)
    expect(keep).toContain('$1')
    expect(keep).toContain(`$${NON_PAYABLE.length}`)
  })

  it('joins the vendor so vendor filtering and sorting work on the aggregate', () => {
    expect(totalsClause(q(''), USER).text).toContain('join vendor_payees v on v.id = p.vendor_id')
  })

  it('applies the same filters as the page query', () => {
    const page = whereClause(q('month=2026-09&status=active&slip=with&min=10'), USER)
    const totals = totalsClause(q('month=2026-09&status=active&slip=with&min=10'), USER)
    // The totals clause is offset by the seeded non-payable params, but the
    // filter structure must match exactly.
    const strip = (s: string) => s.replace(/\$\d+/g, '$?')
    const afterWhere = (s: string) => s.slice(s.lastIndexOf('where ') + 'where '.length)
    expect(strip(afterWhere(totals.text))).toBe(strip(page.text))
  })

  it('has no paging — the totals span the whole filtered set', () => {
    const t = totalsClause(q('', { limit: 50, offset: 100 }), USER)
    expect(t.text).not.toContain('limit')
    expect(t.text).not.toContain('offset')
  })
})
