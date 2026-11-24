#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required; use the isolated PostgreSQL service in GitHub Actions." >&2
  exit 2
fi
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 2; }
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/role-scoped-authz-postgres.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/role-scoped-authz-postgres.assertions.sql"
echo "PASS: isolated role-scoped authorization PostgreSQL suite. No Supabase or Render access."
