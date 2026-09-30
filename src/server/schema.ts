import { pgTable, text, uuid, boolean, numeric, date, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

// Mirror of db/migrations/001+004+008 — source of truth is the SQL migration.
// Names/shapes follow invoice-system conventions so the later Supabase move is a
// copy + RLS-helper swap (app_user_id() → auth.uid()).

export const clientProfiles = pgTable('client_profiles', {
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

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull().default('owner'),
  status: text('status').notNull().default('active'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const authCredentials = pgTable('auth_credentials', {
  userId: uuid('user_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  mustChangePw: boolean('must_change_pw').notNull().default(true),
  tempExpiresAt: timestamp('temp_expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const clientMembers = pgTable('client_members', {
  memberUserId: uuid('member_user_id').notNull(),
  workspaceUserId: text('workspace_user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  passwordChanged: boolean('password_changed').notNull().default(true),
  permissions: jsonb('permissions').notNull().default({}),
})

export const vendorPayees = pgTable('vendor_payees', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  vendorNo: integer('vendor_no').notNull().default(0),
  prefix: text('prefix').notNull().default(''),
  name: text('name').notNull(),
  address: text('address').notNull(),
  idNumberEncrypted: text('id_number_encrypted').notNull(),
  lineUserId: text('line_user_id'),
  phone: text('phone'),
  email: text('email'),
  isVatRegistered: boolean('is_vat_registered').default(false),
})

export const vendorPayables = pgTable('vendor_payables', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
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

export const vendorReceipts = pgTable('vendor_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  docType: text('doc_type').notNull().default('vendor_receipt'),
  transactionId: uuid('transaction_id').notNull(),
  number: text('number').notNull(),
  docNumber: text('doc_number'),
  issueDate: date('issue_date').notNull(),
  verificationCode: text('verification_code').notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  whtAmount: numeric('wht_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  netPayable: numeric('net_payable', { precision: 12, scale: 2 }).notNull().default('0'),
  pdfKey: text('pdf_key'),
  status: text('status').notNull(),
})

export const documentLineItems = pgTable('document_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull(),
  userId: text('user_id').notNull(),
  itemName: text('item_name').notNull(),
  unit: text('unit').notNull().default('รายการ'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const docNumberSequences = pgTable('doc_number_sequences', {
  userId: text('user_id').notNull(),
  docType: text('doc_type').notNull().default('vendor_receipt'),
  beYear: integer('be_year').notNull(),
  vendorNo: integer('vendor_no'),
  prefix: text('prefix'),
  resetYearly: boolean('reset_yearly').notNull().default(true),
  lastNumber: integer('last_number').notNull().default(0),
})

export const whtVendors = pgTable('wht_vendors', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  address: text('address'),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  note: text('note'),
  vendorType: text('vendor_type').notNull().default('company'),
  isActive: boolean('is_active').notNull().default(true),
})

export const whtRecords = pgTable('wht_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  vendorId: uuid('vendor_id').notNull(),
  formType: text('form_type').notNull().default('pnd3'),
  issueDate: date('issue_date').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
  whtRate: numeric('wht_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  whtAmount: numeric('wht_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  certificateNo: text('certificate_no'),
  description: text('description'),
  note: text('note'),
  status: text('status').notNull().default('active'),
  sourceTransactionId: uuid('source_transaction_id'),
})

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('รายการ'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
