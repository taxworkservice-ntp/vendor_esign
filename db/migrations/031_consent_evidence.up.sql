-- 031 consent evidence (UP)
--
-- Two parts. First, the signing evidence: vendor_authorizations stored only
-- consent_text_version (a pointer at wording that may later change). From here
-- the sign route also stores the exact rendered text plus its SHA-256, so a
-- dispute is answered by one row instead of a reconstruction.
--
-- Second, the stored default: tenants seeded before the 5-clause consent still
-- carry the legacy one-liner (or a near-duplicate a read-time shim misses).
-- Upgrade those rows to the current default in place. Rows with a genuinely
-- custom text (200+ chars) are left alone — only the operator console or the
-- client's own Settings edit changes those.

ALTER TABLE vendor_authorizations
  ADD COLUMN IF NOT EXISTS consent_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consent_sha256 text NOT NULL DEFAULT '';

UPDATE config SET value = jsonb_build_object('th', 'ข้าพเจ้าขอรับรองและให้ความยินยอมดังต่อไปนี้
(1) ข้าพเจ้าขอรับรองว่าข้อมูลที่ให้ไว้ในเอกสารนี้ (ชื่อ ที่อยู่ เลขประจำตัวประชาชน และข้อมูลการรับเงิน) เป็นความจริงและถูกต้องทุกประการ และข้าพเจ้าเป็นผู้มีสิทธิรับเงินตามรายการนี้
(2) ข้าพเจ้าได้รับชำระเงินค่าจ้าง/ค่าบริการตามรายการข้างต้นครบถ้วนแล้ว — ยอดรับสุทธิ {{amount}} บาท วันที่ {{date}} อ้างอิง {{ref}}
(3) ข้าพเจ้าขอมอบอำนาจและให้ความยินยอมแก่ {{client}} ในการออกใบเสร็จรับเงินในนามของข้าพเจ้า สำหรับธุรกรรมนี้เท่านั้น
(4) ข้าพเจ้ายินยอมให้ลายมือชื่ออิเล็กทรอนิกส์ที่ข้าพเจ้าลงในเอกสารนี้มีผลผูกพันทางกฎหมายเสมือนการลงลายมือชื่อด้วยมือ ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
(5) ข้าพเจ้าได้อ่านและเข้าใจข้อความข้างต้นแล้ว จึงลงนามเพื่อยืนยัน')
WHERE key = 'consent_text_v1'
  AND value->>'th' IS NOT NULL
  AND (value->>'th' = 'ข้าพเจ้าได้รับเงินจำนวนดังกล่าวแล้ว และมอบอำนาจให้ลูกค้าออกใบเสร็จรับเงินในนามของข้าพเจ้าสำหรับธุรกรรมนี้เท่านั้น'
    OR length(value->>'th') < 200);
