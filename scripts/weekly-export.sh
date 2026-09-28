#!/usr/bin/env bash
# Weekly pilot backup — documented, runnable manually (free-tier backups may not exist).
# Dumps Postgres (schema + data) and lists what else to copy (storage files).
# Usage: ./scripts/weekly-export.sh   (needs NETLIFY_DATABASE_URL in .env.local)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then set -a; source .env.local; set +a; fi
URL="${NETLIFY_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$URL" ]; then
  echo "Missing NETLIFY_DATABASE_URL in .env.local — see docs/DB.md. Nothing exported." >&2
  exit 1
fi

OUT="backups/backup-$(date +%F)"
mkdir -p "$OUT"
pg_dump "$URL" > "$OUT/db.sql"
echo "wrote $OUT/db.sql ($(wc -c < "$OUT/db.sql") bytes)"
echo "NOTE: copy storage files too (slips/, signatures/, pdfs/) when buckets exist."
echo "See docs/restore.md to restore."
