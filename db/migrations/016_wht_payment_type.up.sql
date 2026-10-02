-- WHT description should reflect the payment type (ประเภทการจ่าย) label, not
-- the transaction note. Store the raw payment type key alongside so the label
-- can be resolved from the tenant's wht_rates config (017 refreshes those).

alter table wht_records add column if not exists payment_type text;

update wht_records r set payment_type = (
  select p.payment_type from vendor_payables p where p.id = r.source_transaction_id
) where r.source_transaction_id is not null and r.payment_type is null;

-- Backfill the description to the payment type label where a matching rate
-- entry carries one (configs seeded before 017 have none, so this is a no-op
-- there — safe either way).
update wht_records r
set description = rates.value->>'label'
from config c
cross join lateral jsonb_array_elements(c.value) as rates(value)
where c.user_id = r.user_id
  and c.key = 'wht_rates'
  and r.payment_type is not null
  and rates.value->>'paymentType' = r.payment_type
  and rates.value->>'label' is not null;
