#!/usr/bin/env bash
# Proves a backup restores: dumps $DATABASE_URL, restores the dump into a scratch database on the same
# server, and compares row counts for the tables that matter. Run it against a throwaway/dev database,
# not production. Needs postgresql-client at least the server's major version (pg_dump refuses newer servers).
#
#   DATABASE_URL=postgres://user:pass@host:5432/agroconnect scripts/verify-backup-restore.sh
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database to dump}"
SCRATCH_DATABASE_NAME="${SCRATCH_DATABASE_NAME:-agroconnect_restore_check}"
TABLES="${TABLES:-farmers users payments loan_requests crop_checks listings feedback audit_log}"

for tool in psql pg_dump pg_restore; do
  command -v "$tool" >/dev/null || { echo "$tool not found (install postgresql-client)" >&2; exit 1; }
done

admin_url="${DATABASE_URL%/*}/postgres"
scratch_url="${DATABASE_URL%/*}/${SCRATCH_DATABASE_NAME}"
dump="$(mktemp -t agroconnect-restore.XXXXXX.dump)"
cleanup() { rm -f "$dump"; psql "$admin_url" -X -q -c "DROP DATABASE IF EXISTS \"$SCRATCH_DATABASE_NAME\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Dumping $DATABASE_URL"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" -f "$dump"

echo "Restoring into $SCRATCH_DATABASE_NAME"
psql "$admin_url" -X -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$SCRATCH_DATABASE_NAME\""
psql "$admin_url" -X -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$SCRATCH_DATABASE_NAME\""
pg_restore --no-owner --no-privileges --dbname "$scratch_url" "$dump"

status=0
for table in $TABLES; do
  source_count="$(psql "$DATABASE_URL" -X -tAc "SELECT count(*) FROM $table")"
  restore_count="$(psql "$scratch_url" -X -tAc "SELECT count(*) FROM $table")"
  printf '%-16s source=%-6s restored=%-6s\n' "$table" "$source_count" "$restore_count"
  [ "$source_count" = "$restore_count" ] || status=1
done

if [ "$status" = 0 ]; then
  echo "Backup/restore check passed."
else
  echo "Row counts differ after restore." >&2
  exit 1
fi
