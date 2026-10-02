-- Replace the stamp-duty warning threshold with a WHT minimum threshold
-- (มาตรา 50/1). Below this gross base, WHT is waived (rate → 0) unless the
-- payer forces withholding for a continuous contract. 0 = disabled.
--
-- The old key measured a different thing (stamp duty), so it is dropped rather
-- than renamed; every tenant gets the new key at its default. Written to be
-- idempotent — safe whether or not the old key (or the new one) already exists.

insert into config (user_id, key, value)
select distinct user_id, 'wht_min_threshold', '1000'::jsonb
from config
on conflict (user_id, key) do nothing;

delete from config where key = 'stamp_duty_warning_threshold';
