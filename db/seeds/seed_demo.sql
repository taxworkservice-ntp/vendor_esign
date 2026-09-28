-- Demo seed — FAKE data only, never real personal data.
-- Tenant ABC, 2 vendors, 2 transactions (1 draft, 1 issued w/ receipt).
DO $$
DECLARE v1 uuid; v2 uuid; t1 uuid; t2 uuid; r1 text;
BEGIN
  INSERT INTO vendors (tenant_id, name, address, id_number_encrypted, line_user_id, is_vat_registered)
  VALUES ('ABC','สมชาย ใจดี (ทดสอบ)','12 ม.4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000','enc:FAKE-DATA-1',NULL,false),
         ('ABC','มาลี มีสุข (ทดสอบ)','88/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000','enc:FAKE-DATA-2',NULL,false)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v1 FROM vendors WHERE tenant_id='ABC' AND name LIKE 'สมชาย%' LIMIT 1;
  SELECT id INTO v2 FROM vendors WHERE tenant_id='ABC' AND name LIKE 'มาลี%' LIMIT 1;

  INSERT INTO payment_transactions (tenant_id, ref, vendor_id, payment_type, description, gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_reference, slip_file_path, status, created_by)
  VALUES ('ABC','TX-9001',v1,'ค่าบริการ','ค่าจ้างทำความสะอาด (ข้อมูลทดสอบ)',3000,3,90,2910,'2026-09-22','SEED-9001',NULL,'draft','seed')
  ON CONFLICT (tenant_id, slip_reference) DO NOTHING
  RETURNING id INTO t1;

  INSERT INTO payment_transactions (tenant_id, ref, vendor_id, payment_type, description, gross_amount, wht_rate, wht_amount, net_amount, transfer_date, slip_reference, slip_file_path, status, created_by)
  VALUES ('ABC','TX-9002',v2,'ค่าบริการ','ค่าซ่อมแอร์ (ข้อมูลทดสอบ)',8500,3,255,8245,'2026-09-18','SEED-9002',NULL,'issued','seed')
  ON CONFLICT (tenant_id, slip_reference) DO NOTHING
  RETURNING id INTO t2;

  IF t2 IS NOT NULL THEN
    SELECT next_receipt_number('ABC', 2569, 'ABC-R-2569-') INTO r1;
    INSERT INTO receipts (tenant_id, transaction_id, number, issue_date, verification_code, status)
    VALUES ('ABC', t2, r1, '2026-09-18', encode(gen_random_bytes(6),'hex'), 'issued')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
