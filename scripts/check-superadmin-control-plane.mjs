import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261125190000_superadmin_global_control_plane.sql");
const api = read("../src/app/api/platform/[...segments]/route.ts");
const guard = read("../src/lib/auth/platform-api.ts");
const consoleSource = read("../src/components/admin/platform-superadmin-console.tsx");
const postgresFixture = read("../scripts/fixtures/superadmin-control-plane-postgres.sql");
const postgresAssertions = read("../scripts/fixtures/superadmin-control-plane-postgres.assertions.sql");

for (const token of [
  "private.platform_audit_events", "platform_audit_no_update_delete",
  "private.require_platform_superadmin", "select u.raw_app_meta_data ->> 'platform_role'",
  "platform_create_institution", "platform_update_institution", "platform_set_institution_status",
  "platform_assign_institution_admin", "platform_revoke_institution_admin",
  "platform_list_superadmins", "platform_list_institution_admins",
  "platform_request_delegation", "platform_approve_delegation", "platform_revoke_delegation",
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
assert.equal((postgresFixture.match(/DO \$\$/g) ?? []).length, (postgresFixture.match(/END \$\$;/g) ?? []).length, "PostgreSQL fixture DO blocks must be balanced");
assert.equal((postgresAssertions.match(/DO \$\$/g) ?? []).length, (postgresAssertions.match(/END \$\$;/g) ?? []).length, "PostgreSQL assertion DO blocks must be balanced");
assert.ok(!/DO \$(?!\$)/.test(postgresFixture + postgresAssertions), "Single-dollar DO delimiters are forbidden");

const publicFunctions = [...migration.matchAll(/create or replace function public\.(platform_[a-z_]+)/g)].map((match) => match[1]);
assert.equal(new Set(publicFunctions).size, publicFunctions.length, "Public platform RPCs must not be duplicated");
for (const name of publicFunctions) {
  assert.ok(migration.includes("revoke all on function public." + name + "("), name + " must revoke default PUBLIC execution");
  assert.ok(migration.includes("grant execute on function public." + name + "("), name + " must explicitly grant authenticated execution");
}
assert.equal((migration.match(/as \$\$/g) ?? []).length, (migration.match(/\$\$;/g) ?? []).length, "SQL dollar quotes must be balanced");
assert.ok(!/as \$\r?\n/.test(migration), "Malformed single-dollar function delimiters are forbidden");

const executionMigration = read("../supabase/migrations/20261125193000_superadmin_execution_layer.sql");
const cloneWorker = read("../src/app/api/platform/worker/clones/route.ts");
const planExecutor = read("../src/lib/platform/approved-plan-executor.ts");
const planExecutionRoute = api;
const delegatedWorkspace = read("../src/components/admin/delegated-support-workspace.tsx");
const institutionWorkspace = read("../src/app/dashboard/[slug]/page.tsx");

for (const token of [
  "private.platform_institution_clone_config", "platform_clone_json_is_safe",
  "platform_request_clone_idempotent", "platform_request_delegation_idempotent", "for update skip locked",
  "platform_approve_clone_job", "platform_claim_clone_job", "platform_finish_clone_job",
  "platform_resolve_delegated_context", "platform_resolve_delegated_context_by_slug",
  "platform_claim_ai_change_plan_execution", "platform_finish_ai_change_plan_execution",
  "lease_expires_at", "attempt_count >= 3", "copy_mode <> 'configuration_only'",
]) assert.ok(executionMigration.includes(token), `Missing execution-layer database control: ${token}`);
assert.ok(!executionMigration.includes("user_metadata"), "Delegation and worker authorization must not trust user_metadata");
assert.ok(executionMigration.includes("grant execute on function public.platform_claim_clone_job(integer) to service_role"));
assert.ok(executionMigration.includes("grant execute on function public.platform_finish_clone_job(uuid,boolean,text) to service_role"));
assert.ok(executionMigration.includes("grant execute on function public.platform_resolve_delegated_context_by_slug(text) to authenticated"));
assert.ok(executionMigration.includes("revoke all on function public.platform_request_clone(uuid,text,text,text,text,text) from public, anon, authenticated"));
assert.ok(executionMigration.includes("revoke all on function public.platform_request_delegation(uuid,text,timestamptz,text) from public, anon, authenticated"));
assert.ok(executionMigration.includes("on conflict(institution_id,config_key) do update"), "Clone config copy must be retry-safe");
assert.ok(executionMigration.includes("for update skip locked"), "Worker must claim jobs without double-processing");
assert.equal((executionMigration.match(/as \$\$/g) ?? []).length, (executionMigration.match(/\$\$;/g) ?? []).length, "Execution migration dollar quotes must be balanced");
const executionFunctions = [...executionMigration.matchAll(/create or replace function public\.(platform_[a-z_]+)/g)].map((match) => match[1]);
assert.equal(new Set(executionFunctions).size, executionFunctions.length, "Execution-layer public RPCs must not be duplicated");
for (const name of executionFunctions) {
  assert.ok(executionMigration.includes("revoke all on function public." + name + "("), name + " must revoke default PUBLIC execution");
  assert.ok(executionMigration.includes("grant execute on function public." + name + "("), name + " must grant only an explicit execution role");
}


assert.ok(cloneWorker.includes("EDUNEXA_PLATFORM_WORKER_SECRET"));
assert.ok(cloneWorker.includes("timingSafeEqual"));
assert.ok(cloneWorker.includes("SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY"));
assert.ok(cloneWorker.includes("platform_claim_clone_job") && cloneWorker.includes("platform_finish_clone_job"));
assert.ok(planExecutor.includes('import "server-only"'));
assert.ok(planExecutor.includes("GITHUB_TOKEN") && planExecutor.includes("SUPABASE_ACCESS_TOKEN") && planExecutor.includes("RENDER_API_KEY"));
assert.ok(planExecutor.includes("/database/query/read-only"), "Supabase adapter must use read-only Management API endpoint");
assert.ok(!planExecutor.includes("/database/migrations"), "Supabase adapter must not apply hosted migrations");
assert.ok(!planExecutor.includes("POST /v1/services"), "Render adapter must not mutate hosted services");
assert.ok(planExecutor.includes("base !== INTEGRATION_BRANCH") && planExecutor.includes('head === "main"'));
assert.ok(planExecutionRoute.includes("platform_claim_ai_change_plan_execution"));
assert.ok(planExecutionRoute.includes("platform_finish_ai_change_plan_execution"));
assert.ok(planExecutionRoute.includes("execution.rollback()"), "External GitHub changes need compensation if audit finalization fails");
assert.ok(delegatedWorkspace.includes("MODO DE SOPORTE DELEGADO") && delegatedWorkspace.includes("SOLO LECTURA"));
assert.ok(institutionWorkspace.includes("platform_resolve_delegated_context_by_slug"));
assert.ok(institutionWorkspace.includes("platform_resolve_delegated_context"));
assert.ok(api.includes("platform_request_clone_idempotent") && api.includes("platform_request_delegation_scoped_idempotent"));
assert.ok(api.includes("Idempotency-Key"), "Clone and delegation request routes must require idempotency keys");
assert.ok(!/as \$(?!\$)/.test(executionMigration), "Execution migration cannot contain malformed single-dollar delimiters");
assert.ok(api.includes("platform_approve_clone_job"), "Clone execution must require independent approval");

const scopedMigration = read("../supabase/migrations/20261125200000_superadmin_module_scoped_support_and_config_sync.sql");
const operationsPanel = read("../src/components/admin/platform-operations-panel.tsx");
for (const token of [
  "platform_delegations_module_scope_check", "platform_request_delegation_scoped_idempotent",
  "platform_read_delegated_module", "platform_list_delegations", "platform_list_clone_jobs",
  "platform_refresh_institution_clone_config", "platform_refresh_institution_clone_config_trigger",
  "academic_calendar", "grading_scales", "academic_structure", "platform.delegation.legacy_scope_revoked",
]) assert.ok(scopedMigration.includes(token), `Missing scoped support/config-sync control: ${token}`);
assert.ok(scopedMigration.includes("raw_app_meta_data->>'platform_role'"), "Delegated module reads must revalidate trusted global role");
assert.ok(scopedMigration.includes("d.expires_at>pg_catalog.now()"), "Delegated module reads must enforce expiry");
assert.ok(scopedMigration.includes("p_module_key=any(v_grant.module_scope)"), "Each delegated module must enforce its own scope");
assert.ok(scopedMigration.includes("platform_audit_append('platform.delegation.module.read'"), "Each delegated read must be audited");
assert.ok(scopedMigration.includes("update public.academic_years") === false, "Snapshot sync must not mutate live academic settings");
assert.ok(operationsPanel.includes("moduleScopes") && operationsPanel.includes("execute-next"));
assert.ok(operationsPanel.includes("/approve"), "Console must expose independent approval controls");
assert.ok(consoleSource.includes("PlatformOperationsPanel"));
assert.ok(api.includes("platform_request_delegation_scoped_idempotent"));
assert.ok(api.includes("platform_read_delegated_module"));
assert.ok(api.includes("platform_claim_clone_job") && api.includes("platform_finish_clone_job"));
assert.ok(api.includes("SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY"), "Clone worker credentials must remain server-side");
assert.ok(delegatedWorkspace.includes("moduleScopes") && delegatedWorkspace.includes("Consultar configuración segura"));
assert.ok(institutionWorkspace.includes("module_scope"), "Workspace must receive approved module scope");
assert.ok(postgresAssertions.includes("institution settings must synchronize to the clone registry"));
assert.ok(postgresAssertions.includes("delegated module must return only its allowed safe configuration"));
assert.ok(postgresAssertions.includes("synchronized academic settings were not copied to the cloned tenant"));
assert.equal((scopedMigration.split("as " + String.fromCharCode(36,36)).length - 1), (scopedMigration.split(String.fromCharCode(36,36) + ";").length - 1), "Scoped support migration dollar quotes must be balanced");
const scopedFunctions = [...scopedMigration.matchAll(/create or replace function public\.(platform_[a-z_]+)/g)].map((match) => match[1]);
for (const name of scopedFunctions) {
  assert.ok(scopedMigration.includes("revoke all on function public." + name + "("), name + " must revoke default PUBLIC execution");
  assert.ok(scopedMigration.includes("grant execute on function public." + name + "("), name + " must grant explicit authenticated execution");
}
