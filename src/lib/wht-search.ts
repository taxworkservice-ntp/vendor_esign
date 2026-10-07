// The business identifiers a withholding-tax register is looked up by.
//
// Both executors of the register search are keyed off this list — the server SQL
// builder (server/src/wht-sql.ts) and the client mock filter (src/lib/wht-source.ts).
// Keeping them on one list is what stops the two paths from silently drifting
// (previously the mock searched the form type but the server did not).
//
// Order is the order fields are matched; it is not user-visible.
export const WHT_SEARCH_FIELDS = [
  'certificateNo',
  'receiptNumber',
  'vendorName',
  'vendorTaxId',
  'formType',
  'description',
  'note',
] as const

export type WhtSearchField = (typeof WHT_SEARCH_FIELDS)[number]
