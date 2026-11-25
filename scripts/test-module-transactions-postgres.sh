#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the ephemeral GitHub Actions PostgreSQL service}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing non-local DATABASE_URL for transactional tests." >&2; exit 2 ;;
esac
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/module-transactions-postgres.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/module-transactions-postgres.assertions.sql"
echo "PASS: module transaction suite completed against ephemeral local PostgreSQL only."
