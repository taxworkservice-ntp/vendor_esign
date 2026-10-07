import { describe, expect, it } from 'vitest'
import {
  asWhtSort,
  emptyWhtSummary,
  nextWhtSort,
  sortWht,
  summarizeWht,
  whtSortField,
  type WhtSortKey,
} from './wht-summary'
import { WHT_FORM_LABELS, WHT_FORM_TYPES, whtFormLabel, whtFormTitle, type WhtRecordWithVendor } from './wht'
import { filterWht, whtSearchFields } from './wht-source'
import { parseWhtListQuery, whtQueryToParams } from './wht-list-query'

function rec(o: Partial<WhtRecordWithVendor> & { id: string }): WhtRecordWithVendor {
  return {
    tenantId: 'ABC',
    vendorId: 'v1',
    formType: 'pnd3',
    issueDate: '2026-09-15',
    amount: 1000,
    whtRate: 3,
    whtAmount: 30,
    certificateNo: '26091001',
    status: 'active',
    createdAt: '2026-09-15T00:00:00.000Z',
    ...o,
  }
}

describe('form labels', () => {
  it('labels every form type a certificate can carry', () => {
    for (const f of WHT_FORM_TYPES) {
      expect(whtFormLabel(f)).toBeTruthy()
      expect(whtFormLabel(f)).not.toBe(f)
      expect(whtFormTitle(f)).toBeTruthy()
    }
  })

  it('labels with the government form name, not the raw code', () => {
    expect(whtFormLabel('pnd3')).toBe('ภ.ง.ด.3')
    expect(whtFormLabel('pnd53')).toBe('ภ.ง.ด.53')
  })

  it('falls back to the uppercased code for an unknown form', () => {
    expect(whtFormLabel('pnd99')).toBe('PND99')
    expect(whtFormTitle('pnd99')).toBe('')
  })

  it('has a label for every key in the map and no extras', () => {
    expect(Object.keys(WHT_FORM_LABELS).sort()).toEqual([...WHT_FORM_TYPES].sort())
  })
})

describe('summarizeWht', () => {
  it('returns zeroes for an empty register', () => {
    expect(summarizeWht([])).toEqual(emptyWhtSummary())
  })

  it('totals the base amount and the tax withheld', () => {
    const s = summarizeWht([
      rec({ id: 'a', amount: 1000, whtAmount: 30 }),
      rec({ id: 'b', amount: 2000, whtAmount: 60 }),
    ])
    expect(s.count).toBe(2)
    expect(s.amount).toBe(3000)
    expect(s.whtAmount).toBe(90)
  })

  it('rounds to two decimals, as a filed return does', () => {
    const s = summarizeWht([rec({ id: 'a', amount: 100.005, whtAmount: 0.001 })])
    expect(s.amount).toBe(100.01)
    expect(s.whtAmount).toBe(0)
  })

  it('breaks down by form, in canonical order', () => {
    const s = summarizeWht([
      rec({ id: 'a', formType: 'pnd53', amount: 5000, whtAmount: 150 }),
      rec({ id: 'b', formType: 'pnd3', amount: 1000, whtAmount: 30 }),
      rec({ id: 'c', formType: 'pnd53', amount: 5000, whtAmount: 150 }),
    ])
    expect(s.byForm.map((f) => f.formType)).toEqual(['pnd3', 'pnd53'])
    expect(s.byForm[0]).toMatchObject({ formType: 'pnd3', count: 1, amount: 1000, whtAmount: 30 })
    expect(s.byForm[1]).toMatchObject({ formType: 'pnd53', count: 2, amount: 10000, whtAmount: 300 })
  })

  it('the form rows add up to the headline totals', () => {
    const rows = [
      rec({ id: 'a', formType: 'pnd1', amount: 111.11, whtAmount: 3.33 }),
      rec({ id: 'b', formType: 'pnd53', amount: 222.22, whtAmount: 6.66 }),
      rec({ id: 'c', formType: 'pnd3', amount: 333.33, whtAmount: 10 }),
    ]
    const s = summarizeWht(rows)
    expect(s.byForm.reduce((n, f) => n + f.amount, 0)).toBeCloseTo(s.amount, 2)
    expect(s.byForm.reduce((n, f) => n + f.whtAmount, 0)).toBeCloseTo(s.whtAmount, 2)
  })

  it('counts filed and outstanding separately', () => {
    const s = summarizeWht([
      rec({ id: 'a', status: 'done' }),
      rec({ id: 'b', status: 'active' }),
      rec({ id: 'c', status: 'done' }),
    ])
    expect(s.filedCount).toBe(2)
    expect(s.activeCount).toBe(1)
  })

  it('counts distinct vendors', () => {
    const s = summarizeWht([
      rec({ id: 'a', vendorId: 'v1' }),
      rec({ id: 'b', vendorId: 'v1' }),
      rec({ id: 'c', vendorId: 'v2' }),
    ])
    expect(s.vendors).toBe(2)
  })

  it('keeps a form this build does not know visible instead of dropping it', () => {
    const s = summarizeWht([rec({ id: 'a', formType: 'pnd99' as never, amount: 100 })])
    // Still in the headline total…
    expect(s.amount).toBe(100)
    // …and still shown as its own row, so an unfamiliar code is not silently lost.
    expect(s.byForm.map((f) => f.formType)).toContain('pnd99')
  })
})

describe('sortWht', () => {
  const rows = [
    rec({ id: 'a', issueDate: '2026-09-10', amount: 300, vendorName: 'Z' }),
    rec({ id: 'b', issueDate: '2026-09-20', amount: 100, vendorName: 'A' }),
    rec({ id: 'c', issueDate: '2026-09-15', amount: 200, vendorName: 'M' }),
  ]

  it('sorts by date, newest first by default', () => {
    expect(sortWht(rows, 'date-desc').map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(sortWht(rows, 'date-asc').map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('sorts by amount and by tax withheld', () => {
    expect(sortWht(rows, 'amount-desc').map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(sortWht(rows, 'amount-asc').map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by vendor name', () => {
    expect(sortWht(rows, 'vendor-asc').map((r) => r.vendorName)).toEqual(['A', 'M', 'Z'])
    expect(sortWht(rows, 'vendor-desc').map((r) => r.vendorName)).toEqual(['Z', 'M', 'A'])
  })

  it('does not mutate the input', () => {
    const before = rows.map((r) => r.id)
    sortWht(rows, 'amount-desc')
    expect(rows.map((r) => r.id)).toEqual(before)
  })

  it('breaks ties on id so paging is deterministic', () => {
    const tied = [
      rec({ id: 'z', amount: 100 }),
      rec({ id: 'a', amount: 100 }),
      rec({ id: 'm', amount: 100 }),
    ]
    expect(sortWht(tied, 'amount-desc').map((r) => r.id)).toEqual(['a', 'm', 'z'])
  })
})

describe('wht sort keys', () => {
  it('defaults to newest first', () => {
    expect(asWhtSort(null)).toBe('date-desc')
    expect(asWhtSort('nonsense')).toBe('date-desc')
  })

  it('extracts the field and defaults the direction', () => {
    expect(whtSortField('amount-asc')).toBe('amount')
    expect(whtSortField('bogus' as never)).toBe('date')
  })

  it('toggles direction within a field and switches field on a new column', () => {
    expect(nextWhtSort('date-desc', 'date')).toBe('date-asc')
    expect(nextWhtSort('date-asc', 'date')).toBe('date-desc')
    // A new column starts at its most useful direction: text ascending, figures high.
    expect(nextWhtSort('date-desc', 'amount')).toBe('amount-desc')
    expect(nextWhtSort('date-desc', 'vendor')).toBe('vendor-asc')
    expect(nextWhtSort('date-desc', 'cert')).toBe('cert-asc')
    expect(nextWhtSort('date-desc', 'form')).toBe('form-asc')
    expect(nextWhtSort('date-desc', 'status')).toBe('status-asc')
  })

  it('produces only keys the sorter knows', () => {
    const keys: WhtSortKey[] = [
      'date-desc', 'date-asc',
      'vendor-asc', 'vendor-desc',
      'cert-asc', 'cert-desc',
      'form-asc', 'form-desc',
      'amount-desc', 'amount-asc',
      'wht-desc', 'wht-asc',
      'status-asc', 'status-desc',
    ]
    for (const k of keys) {
      expect(whtSortField(k)).toBeTruthy()
      expect(nextWhtSort(k, whtSortField(k))).toBeTruthy()
    }
  })
})

describe('filterWht', () => {
  const rows = [
    rec({ id: 'a', issueDate: '2026-09-01', formType: 'pnd3', status: 'done', vendorName: 'สมชาย', certificateNo: '2609001' }),
    rec({ id: 'b', issueDate: '2026-09-15', formType: 'pnd53', status: 'active', vendorName: 'บริษัท ก', certificateNo: '2609102', description: 'ค่าที่ปรึกษา' }),
    rec({ id: 'c', issueDate: '2026-08-20', formType: 'pnd3', status: 'active', vendorName: 'บริษัท ก', certificateNo: '2608103' }),
  ]
  const q = (s: string) => parseWhtListQuery(new URLSearchParams(s))

  it('returns everything unfiltered', () => {
    expect(filterWht(rows, q('')).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('scopes on issue_date, not transfer date', () => {
    expect(filterWht(rows, q('month=2026-09')).map((r) => r.id)).toEqual(['a', 'b'])
    expect(filterWht(rows, q('month=2026-08')).map((r) => r.id)).toEqual(['c'])
  })

  it('filters by form type', () => {
    expect(filterWht(rows, q('formType=pnd53')).map((r) => r.id)).toEqual(['b'])
  })

  it('filters by filing status', () => {
    expect(filterWht(rows, q('status=done')).map((r) => r.id)).toEqual(['a'])
    expect(filterWht(rows, q('status=active')).map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('searches the certificate number, vendor, form and description', () => {
    expect(filterWht(rows, q('q=2609102')).map((r) => r.id)).toEqual(['b'])
    expect(filterWht(rows, q('q=' + encodeURIComponent('สมชาย'))).map((r) => r.id)).toEqual(['a'])
    expect(filterWht(rows, q('q=' + encodeURIComponent('ปรึกษา'))).map((r) => r.id)).toEqual(['b'])
    expect(filterWht(rows, q('q=pnd53')).map((r) => r.id)).toEqual(['b'])
  })

  it('combines filters', () => {
    expect(filterWht(rows, q('month=2026-09&status=active')).map((r) => r.id)).toEqual(['b'])
  })

  it('exposes the fields it searches', () => {
    expect(whtSearchFields(rows[0])).toContain('2609001')
    expect(whtSearchFields(rows[0])).toContain('สมชาย')
  })
})

describe('voided / superseded certificates', () => {
  const q = (s: string) => parseWhtListQuery(new URLSearchParams(s))

  it('are excluded from the summary totals and counts', () => {
    const s = summarizeWht([
      rec({ id: 'a', status: 'active', amount: 1000, whtAmount: 30 }),
      rec({ id: 'v', status: 'void', amount: 2000, whtAmount: 60 }),
      rec({ id: 's', status: 'superseded', amount: 3000, whtAmount: 90 }),
    ])
    expect(s.count).toBe(1)
    expect(s.amount).toBe(1000)
    expect(s.whtAmount).toBe(30)
    expect(s.activeCount).toBe(1)
    expect(s.filedCount).toBe(0)
  })

  it('are dropped from the register whatever the status filter', () => {
    const rows = [
      rec({ id: 'a', status: 'active' }),
      rec({ id: 'v', status: 'void' }),
      rec({ id: 's', status: 'superseded' }),
    ]
    expect(filterWht(rows, q('')).map((r) => r.id)).toEqual(['a'])
    expect(filterWht(rows, q('status=active')).map((r) => r.id)).toEqual(['a'])
    expect(filterWht(rows, q('status=done')).map((r) => r.id)).toEqual([])
  })
})

describe('parseWhtListQuery', () => {
  const p = (s: string) => parseWhtListQuery(new URLSearchParams(s))

  it('defaults to the first page, newest first, unfiltered', () => {
    expect(p('')).toEqual({ month: '', q: '', formType: '', status: 'all', sort: 'date-desc', limit: 50, offset: 0 })
  })

  it('drops a malformed month rather than widening to all time', () => {
    expect(p('month=2026-13').month).toBe('')
    expect(p('month=bogus').month).toBe('')
    expect(p('month=2026-09').month).toBe('2026-09')
  })

  it('rejects an unknown form type or status', () => {
    expect(p('formType=pnd99').formType).toBe('')
    expect(p('formType=pnd53').formType).toBe('pnd53')
    expect(p('status=weird').status).toBe('all')
    expect(p('status=done').status).toBe('done')
  })

  it('rejects an unknown sort key', () => {
    expect(p('sort=drop').sort).toBe('date-desc')
    expect(p('sort=amount-asc').sort).toBe('amount-asc')
  })

  it('clamps limit and keeps the export sentinel', () => {
    expect(p('limit=1000000').limit).toBe(200)
    expect(p('limit=-3').limit).toBe(50)
    expect(p('limit=abc').limit).toBe(50)
    expect(p('limit=0').limit).toBe(0)
  })

  it('clamps a negative offset', () => {
    expect(p('offset=-1').offset).toBe(0)
    expect(p('offset=40').offset).toBe(40)
  })

  it('round-trips through params without loss', () => {
    const original = { month: '2026-09', q: 'สมชาย', formType: 'pnd53' as const, status: 'done' as const, sort: 'amount-asc' as const, limit: 25, offset: 50 }
    const back = p(whtQueryToParams(original).toString())
    expect(back).toEqual(original)
  })

  it('omits defaults so a clean query produces an empty string', () => {
    expect(whtQueryToParams(p('')).toString()).toBe('')
  })
})
