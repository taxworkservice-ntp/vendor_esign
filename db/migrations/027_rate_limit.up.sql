-- Persist rate-limit counters and vendor-gate attempts.
--
-- Both were previously held in a per-instance in-memory Map (server/src/shared.ts
-- and server/src/api.ts). On serverless hosting each request may hit a fresh
-- instance, so the limit was effectively not enforced and reset on every deploy.
-- These tables make the counters shared and durable. Code falls back to the
-- in-memory map if the table is absent, so this migration is safe to apply late.
CREATE TABLE IF NOT EXISTS rate_hits (
  key   text PRIMARY KEY,
  n     integer NOT NULL DEFAULT 0,
  reset timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS gate_attempts (
  token_hash text PRIMARY KEY,
  n          integer NOT NULL DEFAULT 0,
  until      timestamptz NOT NULL
);
