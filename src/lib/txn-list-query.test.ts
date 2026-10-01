import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_LIMIT,
  MAX_PAGE_SIZE,
  isUnfiltered,
  pagedQuery,
  parseListQuery,
  queryFromFilters,
  queryToParams,
  statusSet,
  unpaged,
} from './txn-list-query'
import { emptyFilters, type TransactionFilters } from './txn-filters'

const sp = (s: string) => new URLSearchParams(s)
const F = (o: Partial<TransactionFilters>): TransactionFilters => ({ ...emptyFilters(), ...o })

describe('parseListQuery — validation', () => {
  it('defaults everything to a safe, unfiltered first page', () => {
    const q = parseListQuery(sp(''))
    expect(q).toMatchObject({ q: '', status: 'all', month: '', from: '', to: '', slip: 'all', sort: 'date-desc' })
    expect(q.limit).toBe(DEFAULT_PAGE_SIZE)
    expect(q.offset).toBe(0)
    expect(isUnfiltered(q)).toBe(true)
  })

  it('drops a malformed month rather than widening to all time', () => {
    expect(parseListQuery(sp('month=2026-13')).month).toBe('')
    expect(parseListQuery(sp('month=not-a-month')).month).toBe('')
    expect(parseListQuery(sp('month=2026-1')).month).toBe('')
    expect(parseListQuery(sp('month=2026-09')).month).toBe('2026-09')
  })

  it('drops impossible and malformed dates', () => {
    expect(parseListQuery(sp('from=2026-02-31')).from).toBe('')
    expect(parseListQuery(sp('from=2026-13-01')).from).toBe('')
    expect(parseListQuery(sp('to=2026-09-32')).to).toBe('')
    expect(parseListQuery(sp('from=2026-09-01')).from).toBe('2026-09-01')
    // Leap day is real.
    expect(parseListQuery(sp('from=2028-02-29')).from).toBe('2028-02-29')
  })

  it('accepts groups and real statuses, rejects anything else', () => {
    expect(parseListQuery(sp('status=active')).status).toBe('active')
    expect(parseListQuery(sp('status=done')).status).toBe('done')
    expect(parseListQuery(sp('status=voided')).status).toBe('voided')
    expect(parseListQuery(sp('status=sent')).status).toBe('sent')
    expect(parseListQuery(sp('status=issued')).status).toBe('issued')
    expect(parseListQuery(sp('status=drop-table')).status).toBe('all')
    expect(parseListQuery(sp('status=')).status).toBe('all')
  })

  it('accepts only the three slip modes', () => {
    expect(parseListQuery(sp('slip=with')).slip).toBe('with')
    expect(parseListQuery(sp('slip=without')).slip).toBe('without')
    expect(parseListQuery(sp('slip=all')).slip).toBe('all')
    expect(parseListQuery(sp('slip=maybe')).slip).toBe('all')
  })

  it('accepts only the six sort fields, defaulting direction safely', () => {
    for (const f of ['date', 'gross', 'wht', 'net', 'vendor', 'status']) {
      expect(parseListQuery(sp(`sort=${f}-asc`)).sort).toBe(`${f}-asc`)
      // A missing direction means desc, never a malformed key.
      expect(parseListQuery(sp(`sort=${f}`)).sort).toBe(`${f}-desc`)
      expect(parseListQuery(sp(`sort=${f}-sideways`)).sort).toBe(`${f}-desc`)
    }
    expect(parseListQuery(sp('sort=id;drop')).sort).toBe('date-desc')
    expect(parseListQuery(sp('sort=')).sort).toBe('date-desc')
  })

  it('clamps a hostile limit', () => {
    expect(parseListQuery(sp('limit=25')).limit).toBe(25)
    expect(parseListQuery(sp('limit=1000000')).limit).toBe(MAX_PAGE_SIZE)
    expect(parseListQuery(sp('limit=-5')).limit).toBe(DEFAULT_PAGE_SIZE)
    expect(parseListQuery(sp('limit=abc')).limit).toBe(DEFAULT_PAGE_SIZE)
    expect(parseListQuery(sp('limit=10.7')).limit).toBe(10)
  })

  it('keeps limit=0 as the explicit export sentinel', () => {
    expect(parseListQuery(sp('limit=0')).limit).toBe(EXPORT_LIMIT)
  })

  it('never treats an absent limit as the export sentinel', () => {
    // Regression: Number(null) === 0, so matching the sentinel on the parsed
    // number would return the whole table for every request without a limit.
    expect(parseListQuery(sp('')).limit).toBe(DEFAULT_PAGE_SIZE)
    expect(parseListQuery(sp('status=active')).limit).toBe(DEFAULT_PAGE_SIZE)
  })

  it('clamps a negative or non-numeric offset to zero', () => {
    expect(parseListQuery(sp('offset=100')).offset).toBe(100)
    expect(parseListQuery(sp('offset=-1')).offset).toBe(0)
    expect(parseListQuery(sp('offset=abc')).offset).toBe(0)
    expect(parseListQuery(sp('offset=1e9')).offset).toBe(1000000000)
  })

  it('trims and bounds free text', () => {
    expect(parseListQuery(sp('q=%20%20abc%20%20')).q).toBe('abc')
    expect(parseListQuery(sp(`q=${'x'.repeat(500)}`)).q).toHaveLength(120)
  })
})

describe('statusSet', () => {
  it('is empty for all', () => {
    expect(statusSet('all')).toEqual([])
  })

  it('expands the three groups', () => {
    expect(statusSet('active')).toEqual(['draft', 'sent', 'opened', 'signed'])
    expect(statusSet('done')).toEqual(['issued'])
    expect(statusSet('voided')).toEqual(['void', 'cancelled'])
  })

  it('passes an exact status through as a single value', () => {
    expect(statusSet('sent')).toEqual(['sent'])
    expect(statusSet('expired')).toEqual(['expired'])
  })
})

describe('wire round trip', () => {
  it('preserves every field', () => {
    const filters = F({
      search: 'สมชาย',
      status: 'active',
      from: '2026-09-01',
      to: '2026-09-30',
      paymentType: 'ค่าเช่า',
      slip: 'without',
      minNet: '100',
      maxNet: '9000',
      vendorId: 'v1',
      sort: 'net-asc',
    })
    const q = parseListQuery(queryToParams({ ...queryFromFilters(filters), limit: DEFAULT_PAGE_SIZE, offset: 0 }))
    expect(q).toMatchObject({
      q: 'สมชาย',
      status: 'active',
      from: '2026-09-01',
      to: '2026-09-30',
      paymentType: 'ค่าเช่า',
      slip: 'without',
      min: '100',
      max: '9000',
      vendorId: 'v1',
      sort: 'net-asc',
    })
  })

  it('keeps paging through a round trip', () => {
    const q = parseListQuery(queryToParams({ ...queryFromFilters(F({})), limit: 25, offset: 100 }))
    expect(q.limit).toBe(25)
    expect(q.offset).toBe(100)
  })

  it('emits a bare month and suppresses a custom range that the month overrides', () => {
    const q = queryFromFilters(F({ month: '2026-09', from: '2026-01-01', to: '2026-01-31' }))
    expect(q.month).toBe('2026-09')
    expect(q.from).toBe('')
    expect(q.to).toBe('')
  })

  it('omits defaults so a clean filter set produces an empty query string', () => {
    expect(queryToParams({ ...queryFromFilters(F({})), limit: DEFAULT_PAGE_SIZE, offset: 0 }).toString()).toBe('')
  })

  it('detects an unfiltered query', () => {
    const clean = { ...queryFromFilters(F({})), limit: 50, offset: 0 }
    expect(isUnfiltered(clean)).toBe(true)
    expect(isUnfiltered({ ...clean, q: 'x' })).toBe(false)
    expect(isUnfiltered({ ...clean, status: 'done' })).toBe(false)
    expect(isUnfiltered({ ...clean, slip: 'with' })).toBe(false)
    expect(isUnfiltered({ ...clean, attention: true })).toBe(false)
  })

  it('carries the attention flag, and only when set', () => {
    expect(parseListQuery(sp('attention=1')).attention).toBe(true)
    expect(parseListQuery(sp('attention=true')).attention).toBe(false)
    expect(parseListQuery(sp('attention=yes')).attention).toBe(false)
    expect(parseListQuery(sp('')).attention).toBe(false)
    // Round-trips, and stays out of the URL when off.
    expect(queryToParams({ ...queryFromFilters(F({ attention: true })), limit: 50, offset: 0 }).get('attention')).toBe('1')
    expect(queryToParams({ ...queryFromFilters(F({})), limit: 50, offset: 0 }).has('attention')).toBe(false)
  })

  it('strips paging for a full-set export without touching the filters', () => {
    const q = pagedQuery(F({ status: 'active', search: 'ก' }), 3, 50)
    expect(q).toMatchObject({ status: 'active', q: 'ก', limit: 50, offset: 150 })
    const all = unpaged(q)
    expect(all.limit).toBe(EXPORT_LIMIT)
    expect(all.offset).toBe(0)
    expect(all.status).toBe('active')
    expect(all.q).toBe('ก')
  })
})

describe('pagedQuery', () => {
  it('multiplies page by page size', () => {
    expect(pagedQuery(F({}), 0, 50).offset).toBe(0)
    expect(pagedQuery(F({}), 1, 50).offset).toBe(50)
    expect(pagedQuery(F({}), 4, 25).offset).toBe(100)
  })

  it('never produces a negative offset', () => {
    expect(pagedQuery(F({}), -2, 50).offset).toBe(0)
  })
})
