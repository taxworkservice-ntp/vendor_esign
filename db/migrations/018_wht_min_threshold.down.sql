-- Restore the stamp-duty warning threshold key/value and drop the WHT minimum.
insert into config (user_id, key, value)
select distinct user_id, 'stamp_duty_warning_threshold', '20000'::jsonb
from config
on conflict (user_id, key) do nothing;

delete from config where key = 'wht_min_threshold';
