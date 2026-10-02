-- Replace WHT payment types with Revenue Department standard presets (PND3).
-- 6 fixed categories: ค่าจ้างทำของ, ค่าวิชาชีพอิสระ, ค่าบริการ, ค่าเช่าทรัพย์สิน, ค่านายหน้า, ค่าขนส่ง

update config set value = '[
  {"paymentType":"ค่าจ้างทำของ","rate":3,"label":"ค่าจ้างทำของ"},
  {"paymentType":"ค่าวิชาชีพอิสระ","rate":3,"label":"ค่าวิชาชีพอิสระ"},
  {"paymentType":"ค่าบริการ","rate":3,"label":"ค่าบริการ"},
  {"paymentType":"ค่าเช่าทรัพย์สิน","rate":5,"label":"ค่าเช่าทรัพย์สิน"},
  {"paymentType":"ค่านายหน้า","rate":3,"label":"ค่านายหน้า"},
  {"paymentType":"ค่าขนส่ง","rate":1,"label":"ค่าขนส่ง"},
  {"paymentType":"ไม่หักภาษี ณ ที่จ่าย","rate":0,"label":"ไม่หักภาษี ณ ที่จ่าย"}
]'::jsonb where key = 'wht_rates';
