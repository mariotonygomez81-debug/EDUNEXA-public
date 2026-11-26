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
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125230425_superadmin_global_control_plane.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125230430_superadmin_execution_layer.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125230434_superadmin_module_scoped_support_and_config_sync.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261125203000_expand_institution_profiles_and_branding.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261126160000_platform_superadmin_change_request_listing.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261126170000_platform_admin_invitation.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261126180000_platform_admin_invitation_approval.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261126190000_platform_auth_email_return_types.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261126200000_superadmin_audit_and_admin_lifecycle.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/superadmin-control-plane-postgres.assertions.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/fixtures/superadmin-audit-admin-lifecycle.assertions.sql"
echo "PASS: Superadmin control plane validated in isolated local PostgreSQL only."
