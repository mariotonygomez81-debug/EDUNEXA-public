#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the ephemeral GitHub Actions PostgreSQL service}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing non-local DATABASE_URL for Superadmin transaction tests." >&2; exit 2 ;;
esac
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/superadmin-control-plane-postgres.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125190000_superadmin_global_control_plane.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125193000_superadmin_execution_layer.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/superadmin-control-plane-postgres.assertions.sql"
echo "PASS: Superadmin control plane validated in isolated local PostgreSQL only."
