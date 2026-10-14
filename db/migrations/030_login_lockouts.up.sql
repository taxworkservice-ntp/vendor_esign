-- Persist per-email login lockouts.
--
-- Client login lockout previously lived in a per-instance in-memory Map
-- (server/src/client-auth.ts), and the admin login had no per-email lockout at
-- all. On serverless hosting each request may hit a fresh instance, so the
-- lockout was effectively not enforced there — exactly the gap a password
-- spray exploits. This table makes the counters shared and durable. Code falls
-- back to the in-memory map if the table is absent, so this migration is safe
-- to apply late (same contract as 027 rate_hits).
CREATE TABLE IF NOT EXISTS login_lockouts (
  email text PRIMARY KEY,
  fails integer NOT NULL DEFAULT 0,
  until timestamptz NOT NULL
);
