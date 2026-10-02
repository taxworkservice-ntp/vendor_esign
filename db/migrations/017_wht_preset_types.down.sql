-- Restore old payment types (pre-preset)
update config set value = '[
  {"paymentType":"ค่าบริการ","rate":3,"label":"ค่าบริการ"},
  {"paymentType":"ค่าเช่า","rate":5,"label":"ค่าเช่า"},
  {"paymentType":"ค่าขนส่ง","rate":1,"label":"ค่าขนส่ง"},
  {"paymentType":"ทั่วไป","rate":0,"label":"ไม่หักภาษี ณ ที่จ่าย"}
]'::jsonb where key = 'wht_rates';
