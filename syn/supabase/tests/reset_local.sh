#!/usr/bin/env bash
# Recreates a local database with the Supabase stub + all migrations.
set -euo pipefail
DB_URL="${SYN_DB_URL:-postgresql://syn:syn@localhost/syn}"
ADMIN_URL="${DB_URL%/*}/postgres"
DB_NAME="${DB_URL##*/}"
here="$(cd "$(dirname "$0")" && pwd)"
psql "$ADMIN_URL" -qc "drop database if exists $DB_NAME with (force)" -c "create database $DB_NAME"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$here/local_supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
echo "local db ready: $DB_URL"
