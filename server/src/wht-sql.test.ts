import { describe, expect, it } from 'vitest'
import { SEARCH_COLUMN_SQL } from './wht-sql'
import { WHT_SEARCH_FIELDS } from '../../src/lib/wht-search'

// The register search runs twice — once in SQL here, once in the client mock
// (src/lib/wht-source.ts). Both are keyed off src/lib/wht-search.ts, and this
// test is what keeps the SQL side from silently dropping a shared field.

describe('WHT search contract', () => {
  it('the SQL builder covers exactly the shared search fields', () => {
    expect(Object.keys(SEARCH_COLUMN_SQL).sort()).toEqual([...WHT_SEARCH_FIELDS].sort())
  })

  it('looks the receipt number up from the source receipt', () => {
    expect(SEARCH_COLUMN_SQL.receiptNumber).toContain('vendor_receipts')
    expect(SEARCH_COLUMN_SQL.receiptNumber).toContain('source_transaction_id')
  })
})
