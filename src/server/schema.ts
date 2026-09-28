import { pgTable, text, uuid, boolean, numeric, date, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

// Mirror of db/migrations/001 — source of truth is the SQL migration.
// This schema exists so future Netlify Functions can use typed queries.

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const vendors = pgTable('vendors', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  idNumberEncrypted: text('id_number_encrypted').notNull(),
  lineUserId: text('line_user_id'),
  isVatRegistered: boolean('is_vat_registered').default(false),
})

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  ref: text('ref').notNull(),
  vendorId: uuid('vendor_id').notNull(),
  paymentType: text('payment_type').notNull(),
  description: text('description').notNull(),
  grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
  whtRate: numeric('wht_rate', { precision: 5, scale: 2 }).notNull(),
  whtAmount: numeric('wht_amount', { precision: 12, scale: 2 }).notNull(),
  netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
  transferDate: date('transfer_date').notNull(),
  slipFilePath: text('slip_file_path'),
  slipReference: text('slip_reference').notNull(),
  status: text('status').notNull(),
})

export const receipts = pgTable('receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  transactionId: uuid('transaction_id').notNull(),
  number: text('number').notNull(),
  issueDate: date('issue_date').notNull(),
  verificationCode: text('verification_code').notNull(),
  status: text('status').notNull(),
})

export const receiptCounters = pgTable('receipt_counters', {
  tenantId: text('tenant_id').notNull(),
  beYear: integer('be_year').notNull(),
  lastNumber: integer('last_number').notNull().default(0),
})
