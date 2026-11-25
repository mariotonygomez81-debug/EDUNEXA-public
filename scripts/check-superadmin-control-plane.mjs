import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261125190000_superadmin_global_control_plane.sql");
const api = read("../src/app/api/platform/[...segments]/route.ts");
const guard = read("../src/lib/auth/platform-api.ts");
const consoleSource = read("../src/components/admin/platform-superadmin-console.tsx");

for (const token of [
  "private.platform_audit_events", "platform_audit_no_update_delete",
  "private.require_platform_superadmin", "select u.raw_app_meta_data ->> 'platform_role'",
  "platform_create_institution", "platform_update_institution", "platform_set_institution_status",
  "platform_assign_institution_admin", "platform_revoke_institution_admin",
  "platform_list_superadmins", "platform_list_institution_admins",\n  "platform_request_delegation", "platform_approve_delegation", "platform_revoke_delegation",
  "platform_request_clone", "platform_create_superadmin_change",
  "platform_approve_superadmin_change", "platform_claim_superadmin_change",
  "platform_finish_superadmin_change", "platform_create_ai_change_plan",
  "platform_approve_ai_change_plan", "platform_list_audit_events",
  "configuration_only", "cannot_revoke_last_superadmin",
]) assert.ok(migration.includes(token), `Missing database control: ${token}`);

assert.ok(!migration.includes("user_metadata"), "Authorization must never trust user_metadata");
assert.ok(migration.includes("revoke all on private.platform_audit_events from public, anon, authenticated"));
assert.ok(migration.includes("grant execute on function public.platform_create_institution"));
assert.ok(migration.includes("pg_advisory_xact_lock"), "Global privilege changes must serialize");
assert.ok(migration.includes("executed_by"), "Superadmin privilege changes must bind executor to request");
assert.ok(api.includes("https://api.groq.com/openai/v1/chat/completions"));
assert.ok(api.includes("GROQ_API_KEY"), "Copilot must use Groq only");
assert.ok(api.includes("executionMode: \"review_only\""));
assert.ok(api.includes("executionEnabled: false"), "AI plan approval must not silently execute infrastructure changes");
assert.ok(api.includes("SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY"), "Auth admin key must remain server-only");
assert.ok(api.includes("updateUserById"), "Approved Superadmin role changes must update trusted Auth app_metadata");
assert.ok(guard.includes("isPlatformSuperAdmin(user)"));
assert.ok(guard.includes('request.headers.get("origin")'));
assert.ok(consoleSource.includes("Copiloto EDUNEXA"));
console.log("PASS: Superadmin API, trusted authorization, audit, approval and Groq-only static contract checks.");
