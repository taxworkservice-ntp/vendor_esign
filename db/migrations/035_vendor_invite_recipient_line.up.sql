-- 035 vendor invite recipient LINE hint (UP)
-- When creating an onboarding link the client may record who they are sending
-- it to: a short name (existing `label`) and the vendor's LINE id. Kept as its
-- own column so it never collides with `line_user_id`, which holds the LINE id
-- the vendor themselves submits. Used to prefill the vendor's LINE field.
ALTER TABLE vendor_invites ADD COLUMN IF NOT EXISTS recipient_line text;
