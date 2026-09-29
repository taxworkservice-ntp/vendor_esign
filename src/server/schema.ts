import { pgTable, text, uuid, boolean, numeric, date, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

// Mirror of db/migrations/001+004 — source of truth is the SQL migration.
// This schema exists so future Netlify Functions can use typed queries.

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  clientCode: text('client_code'),
  displayName: text('display_name'),
  address: text('address'),
  taxId: text('tax_id'),
  contactName: text('contact_name'),
  status: text('status'),
  beYear: integer('be_year'),
  startNumber: integer('start_number'),
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
  note: text('note').notNull().default(''),
  lineItems: jsonb('line_items').notNull().default([]),
  grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
  whtRate: numeric('wht_rate', { precision: 5, scale: 2 }).notNull(),
  whtMode: text('wht_mode').notNull().default('deduct'),
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

export const appUsers = pgTable('app_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustChangePw: boolean('must_change_pw').notNull().default(true),
  status: text('status').notNull().default('active'),
})

export const userTenants = pgTable('user_tenants', {
  userId: uuid('user_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  role: text('role').notNull(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
