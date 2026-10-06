import { randomBytes } from 'node:crypto'
import { sql, withTenant } from '../../src/server/db'
import { amountToThaiWords } from '../../src/lib/thai-words'
import { isEntityName, vendorDisplayName } from '../../src/lib/vendor-name'
import { currentBeYear } from '../../src/lib/settings-types'
import { formTypeForVendorType } from '../../src/lib/wht'
import { decryptId } from './crypto'
import { isoDay } from './dates'
import { readStoredDurable, saveBytesDurable } from './storage'
import { buildReceiptPdf } from './pdf'
import { CLIENT_DISPLAY, PILOT_BE_YEAR, PUBLIC_BASE, audit, one, tenantProfile } from './shared'

// Issue a vendor receipt: assign the statutory series number, record the receipt
// row, generate the PDF (with the vendor signature), auto-create the WHT
// certificate, and advance the payable to `issued` — all in one flow.
//
// Extracted so it runs from BOTH the client finalize endpoint and the vendor
// sign endpoint. Issuing at signing means the vendor gets the real number and
// the PDF immediately (no client round-trip), which is the pilot's intended
// workflow. Idempotent: a second call for an already-issued receipt returns the
// same number/code and does not consume another number (never gaps, never
// MAX()+1 — `generate_doc_number` locks the counter row).
export type FinalizeResult =
  | { ok: true; number: string; verificationCode: string; pdfSha256: string; pdfPath: string; pdfBytes: Uint8Array }
  | { ok: false; error: 'already-issued' | 'not-signed' }

export async function finalizeReceipt(txnId: string, ip: string): Promise<FinalizeResult> {
  const db = sql()

  const txnRows = (await db`select user_id from vendor_payables where id = ${txnId}`) as unknown as
    { user_id: string }[]
  const rowTenant = txnRows[0] ? String(txnRows[0].user_id) : process.env.PILOT_TENANT ?? 'ABC'
  const prof = (await tenantProfile(rowTenant)) ?? { code: rowTenant, beYear: PILOT_BE_YEAR, display: CLIENT_DISPLAY }

  const existing = await db`
    select r.number, r.verification_code, r.pdf_path, r.pdf_sha256 from vendor_receipts r
    where r.transaction_id = ${txnId} and r.user_id = ${rowTenant}`
  const ex = one<Record<string, unknown>>(existing)
  if (ex?.pdf_path) {
    // Already fully issued: return the stored artifact rather than 409, so the
    // caller (sign) can still hand the vendor the number/PDF.
    const pdfPath = String(ex.pdf_path)
    return {
      ok: true,
      number: String(ex.number),
      verificationCode: String(ex.verification_code).toUpperCase(),
      pdfSha256: String(ex.pdf_sha256 ?? ''),
      pdfPath,
      pdfBytes: (await readStoredDurable(rowTenant, pdfPath)) ?? new Uint8Array(),
    }
  }

  let number: string
  let code: string
  if (ex) {
    number = String(ex.number)
    code = String(ex.verification_code)
  } else {
    const auth = await db`select vendor_name, vendor_address from vendor_authorizations
      where transaction_id = ${txnId} and user_id = ${rowTenant}`
    if (!one(auth)) return { ok: false, error: 'not-signed' }
    code = randomBytes(6).toString('hex')
    const vno = one<{ vendor_no: number; transfer_date: unknown }>(await db`
      select v.vendor_no, p.transfer_date from vendor_payables p
      join vendor_payees v on v.id = p.vendor_id
      where p.id = ${txnId} and p.user_id = ${rowTenant}`)
    // RCT-{VENDORNO}-{BE_YEAR}-{NNN}. The series year follows the PAYMENT date —
    // the receipt's accounting period — so a late-issued receipt is numbered in
    // the same BE year as its printed date and its WHT certificate (never a
    // year ahead just because it was signed in a later January).
    const payDate = isoDay(vno?.transfer_date)
    const beYear = payDate ? Number(payDate.slice(0, 4)) + 543 : currentBeYear()
    const n = await db`select generate_doc_number(${rowTenant}, 'vendor_receipt', ${beYear}, ${Number(vno?.vendor_no ?? 0)}) as number`
    number = String(one<Record<string, unknown>>(n)?.number)
    await db`insert into vendor_receipts (user_id, transaction_id, number, issue_date, verification_code, status)
      values (${rowTenant}, ${txnId}, ${number}, CURRENT_DATE, ${code}, 'issued')`
    await db`update vendor_payables set status = 'issued' where id = ${txnId}`
    await withTenant(rowTenant, 'client', async () =>
      audit(rowTenant, 'vendor_receipts', txnId, 'receipt.issued', 'system', { number }, ip))
  }

  const rows = await db`
    select t.description, t.note, t.payment_type, t.line_items, t.gross_amount, t.wht_rate, t.wht_amount, t.net_amount,
      t.transfer_date, t.slip_reference,
      a.vendor_prefix, a.vendor_name, a.vendor_address, a.vendor_masked_id, a.vendor_phone, a.vendor_email,
      a.auth_ref, a.signature_image_path,
      a.signed_at, a.verification_method, a.consent_text_version
    from vendor_payables t
    join vendor_authorizations a on a.transaction_id = t.id
    where t.id = ${txnId} and t.user_id = ${rowTenant}`
  const d = one<{
    description: string; note: string; payment_type: string | null; line_items: unknown;
    gross_amount: string; wht_rate: string; wht_amount: string;
    net_amount: string; transfer_date: string; slip_reference: string;
    vendor_prefix: string; vendor_name: string; vendor_address: string; vendor_masked_id: string;
    vendor_phone: string | null; vendor_email: string | null; auth_ref: string | null;
    signature_image_path: string; signed_at: string;
    verification_method: string; consent_text_version: string;
  }>(rows)
  if (!d) return { ok: false, error: 'not-signed' }

  // Auto-generate the withholding certificate on issuance (idempotent per txn).
  const whtAmountNum = Number(d.wht_amount)
  if (whtAmountNum > 0) {
    await withTenant(rowTenant, 'owner', async () => {
      const already = one<{ id: string }>(
        await db`select id from wht_records where user_id = ${rowTenant} and source_transaction_id = ${txnId}`,
      )
      if (already) return
      let taxId = ''
      try {
        const enc = one<{ id_number_encrypted: string | null }>(await db`
          select v.id_number_encrypted from vendor_payables p
          join vendor_payees v on v.id = p.vendor_id
          where p.id = ${txnId} and p.user_id = ${rowTenant}`)
        if (enc?.id_number_encrypted) taxId = decryptId(enc.id_number_encrypted) ?? ''
      } catch {
        /* key absent — certificate still issues without tax id */
      }
      const vName = vendorDisplayName(d.vendor_prefix, d.vendor_name)
      const vType: 'individual' | 'company' = isEntityName(d.vendor_name) ? 'company' : 'individual'
      const wv = one<{ id: string }>(await db`select id from wht_vendors
        where user_id = ${rowTenant} and ((${taxId} <> '' and tax_id = ${taxId}) or name = ${vName}) limit 1`)
      let vendorId = wv?.id
      if (!vendorId) {
        vendorId = String(
          one<{ id: string }>(await db`insert into wht_vendors (user_id, name, tax_id, address, vendor_type)
            values (${rowTenant}, ${vName}, ${taxId}, ${d.vendor_address}, ${vType}) returning id`)?.id,
        )
      }
      const issueDate = isoDay(d.transfer_date)
      // The printed description is the payment type NAME (ประเภทการจ่าย), not
      // the transaction note and not a stored label — older labels carried a
      // rate suffix ("ค่าบริการ — 3%") which must not appear on the form.
      const whtDescription = d.payment_type || d.note || d.description
      await db`insert into wht_records
        (user_id, vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, description, status, certificate_no, source_transaction_id)
        values (${rowTenant}, ${vendorId}, ${formTypeForVendorType(vType)}, ${issueDate}::date,
          ${Number(d.gross_amount)}, ${Number(d.wht_rate)}, ${whtAmountNum}, ${whtDescription}, 'active',
          generate_wht_certificate_no(${rowTenant}, ${issueDate}::date), ${txnId})`
    })
  }

  const rawItems = Array.isArray(d.line_items) ? (d.line_items as { description?: unknown; amount?: unknown }[]) : []
  const lineItems = rawItems
    .map((it) => ({ description: String(it.description ?? ''), amount: Number(it.amount) || 0 }))
    .filter((it) => it.description.trim() || it.amount > 0)
  // Read the vendor's signature through the storage seam so it comes from R2
  // when configured — a serverless instance rarely has the file on local disk.
  const sig = await readStoredDurable(rowTenant, d.signature_image_path)
  const verifyUrl = `${PUBLIC_BASE}/verify/${code.toUpperCase()}`
  const { bytes, sha256 } = await buildReceiptPdf({
    number,
    // The document's date is the payment date (Model A), matching the on-screen
    // receipt; the real issuance is recorded separately (vendor_receipts.issue_date).
    issueDate: isoDay(d.transfer_date),
    verifyUrl,
    verificationCode: code.toUpperCase(),
    verificationMethod: d.verification_method,
    consentVersion: d.consent_text_version,
    signedAt: d.signed_at,
    client: { code: prof.code, display: prof.display },
    vendor: {
      prefix: d.vendor_prefix, name: d.vendor_name, address: d.vendor_address, maskedId: d.vendor_masked_id,
      phone: d.vendor_phone ?? undefined, email: d.vendor_email ?? undefined,
    },
    lineItems,
    note: d.note,
    description: d.description,
    grossAmount: Number(d.gross_amount),
    whtRate: Number(d.wht_rate),
    whtAmount: Number(d.wht_amount),
    netAmount: Number(d.net_amount),
    amountWords: amountToThaiWords(Number(d.net_amount)),
    transferDate: isoDay(d.transfer_date),
    slipReference: d.slip_reference,
    signaturePng: sig,
  })
  const pdfPath = await saveBytesDurable('pdfs', `${number}.pdf`, bytes, rowTenant)
  await db`update vendor_receipts set pdf_path = ${pdfPath}, pdf_sha256 = ${sha256}
    where transaction_id = ${txnId} and user_id = ${rowTenant}`
  return { ok: true, number, verificationCode: code.toUpperCase(), pdfSha256: sha256, pdfPath, pdfBytes: bytes }
}
