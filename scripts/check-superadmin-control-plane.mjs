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
assert.ok(planExecutor.includes("GITHUB_TOKEN"), "Copilot GitHub adapter must remain server-only");
assert.ok(!planExecutor.includes("SUPABASE_ACCESS_TOKEN") && !planExecutor.includes("RENDER_API_KEY"), "Copilot must not access hosted Supabase or Render");
assert.ok(!planExecutor.includes("create_pull_request") && !planExecutor.includes("/pulls"), "Copilot must not create PRs");
assert.ok(planExecutor.includes("plan_step_outside_current_platform_scope"), "The complete plan must be rejected before any external call when it exceeds scope");
assert.ok(planExecutor.includes('INTEGRATION_BRANCH = "feature/EDUNEXA-MODELES"'), "CI dispatch must remain pinned to the authorized branch");
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
const governancePanel = read("../src/components/admin/platform-governance-panel.tsx");
const privilegeQueueMigration = read("../supabase/migrations/20261126160000_platform_superadmin_change_request_listing.sql");
const profileMigration = read("../supabase/migrations/20261125203000_expand_institution_profiles_and_branding.sql");
const superadminTestRunner = read("../scripts/test-superadmin-control-plane-postgres.sh");
const adminInviteMigration = read("../supabase/migrations/20261126170000_platform_admin_invitation.sql");
const institutionAdminsPanel = read("../src/components/admin/platform-institution-admins-panel.tsx");
for (const token of [
  "platform_delegations_module_scope_check", "platform_request_delegation_scoped_idempotent",
  "platform_read_delegated_module", "platform_list_delegations", "platform_list_clone_jobs",
  "platform_refresh_institution_clone_config", "platform_refresh_institution_clone_config_trigger",
  "platform_list_ai_change_plans", "platform_clone_materialize_academic_configuration",
  "platform_clone_materialize_trigger", "platform_clone_materialize_configuration",
  "institution_profile", "platform_refresh_institution_profile_clone_config_trigger",
  "platform_clone_snapshot_institution_profile", "platform_clone_snapshot_campuses",
  "edunexa_clone_campus_map", "'name',cp.name,'code',cp.code,'is_main',cp.is_main",
  "academic_calendar", "grading_scales", "academic_structure",
  "platform.delegation.legacy_scope_revoked", "has_active_delegated_module_scope",
  "platform_delegated_config_docentes_select", "platform_delegated_config_preceptor_select",
  "platform_delegated_config_alumnos_select", "platform_delegated_config_tutor_select",
  "platform_delegated_config_directivos_select", "platform_delegated_config_administrativos_select",
  "platform_delegated_config_administrador_select",
]) assert.ok(scopedMigration.includes(token), `Missing scoped support/config-sync control: ${token}`);
assert.ok(scopedMigration.includes("raw_app_meta_data->>'platform_role'"), "Delegated module reads must revalidate trusted global role");
assert.ok(scopedMigration.includes("d.expires_at>pg_catalog.now()"), "Delegated module reads must enforce expiry");
assert.ok(scopedMigration.includes("p_module_key=any(v_grant.module_scope)"), "Each delegated module must enforce its own scope");
assert.ok(scopedMigration.includes("platform_audit_append('platform.delegation.module.read'"), "Each delegated read must be audited");
assert.ok(scopedMigration.includes("grant execute on function private.has_active_delegated_module_scope(uuid,text) to authenticated"));
assert.ok(!scopedMigration.includes("grant select on private.platform_institution_clone_config"), "Private config registry must not be directly selectable by application roles");
assert.ok(scopedMigration.includes("update public.academic_years") === false, "Snapshot sync must not mutate live academic settings");
assert.ok(operationsPanel.includes("moduleScopes") && operationsPanel.includes("execute-next"));
assert.ok(operationsPanel.includes("/api/platform/copilot/plans") && operationsPanel.includes("Ejecutar plan aprobado"));
assert.ok(api.includes("platform_list_ai_change_plans"), "Console must list Groq plans for review and approval");
assert.ok(operationsPanel.includes("/approve"), "Console must expose independent approval controls");
assert.ok(consoleSource.includes("PlatformOperationsPanel"));
assert.ok(api.includes("platform_request_delegation_scoped_idempotent"));
assert.ok(api.includes("platform_read_delegated_module"));
assert.ok(api.includes("platform_claim_clone_job") && api.includes("platform_finish_clone_job"));
assert.ok(api.includes("SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY"), "Clone worker credentials must remain server-side");
assert.ok(delegatedWorkspace.includes("moduleScopes") && delegatedWorkspace.includes("Consultar configuración segura"));
assert.ok(institutionWorkspace.includes("module_scope"), "Workspace must receive approved module scope");
assert.ok(postgresAssertions.includes("safe institutional settings must synchronize without campus contact fields"));
assert.ok(postgresAssertions.includes("two institutions must keep independent campus configuration snapshots"));
assert.ok(postgresAssertions.includes("configuration-only clone must copy only safe campus identity and preserve tenant isolation"));
assert.ok(postgresAssertions.includes("clone must materialize safe institution profile settings from its private registry"));
assert.ok(postgresAssertions.includes("delegated module % exceeded its read-only configuration allowlist"));
assert.ok(postgresAssertions.includes("delegated context must include all seven explicitly approved read-only modules"));
assert.ok(postgresAssertions.includes("each of the seven delegated module reads must append an audit event"));
for (const moduleKey of ["preceptor","alumnos","tutor","directivos","administrativos","administrador"]) {
  assert.ok(postgresAssertions.includes("RLS scope mismatch for " + moduleKey), "Missing direct RLS test for " + moduleKey);
}
assert.ok(postgresAssertions.includes("synchronized academic settings were not copied to the cloned tenant"));
assert.ok(postgresAssertions.includes("configuration-only clone must materialize academic settings"));
assert.ok(postgresAssertions.includes("transient worker failure must requeue the approved job"));
assert.ok(postgresAssertions.includes("expected expired delegation denial"));
assert.ok(privilegeQueueMigration.includes("public.platform_list_superadmin_change_requests"), "Superadmin privilege requests need an audited listing RPC");
assert.ok(privilegeQueueMigration.includes("private.require_platform_superadmin()"), "Privilege request listing must revalidate the trusted global role");
assert.ok(privilegeQueueMigration.includes("private.platform_audit_append("), "Privilege request listing must itself be audited");
assert.ok(privilegeQueueMigration.includes("revoke all on function public.platform_list_superadmin_change_requests(integer) from public,anon"));
assert.ok(privilegeQueueMigration.includes("grant execute on function public.platform_list_superadmin_change_requests(integer) to authenticated"));
assert.ok(api.includes("platform_list_superadmin_change_requests"), "API must expose the approved privilege request queue");
assert.ok(governancePanel.includes("/api/platform/superadmins/requests") && governancePanel.includes("Aprobar como segundo responsable"));
assert.ok(governancePanel.includes("Ejecutar cambio aprobado") && governancePanel.includes("/api/platform/audit"));
assert.ok(consoleSource.includes("PlatformGovernancePanel") && consoleSource.includes('href="#superadmin-governance"'));
assert.ok(profileMigration.includes("contact_email text") && profileMigration.includes("tax_id text"), "Institution profile migration must define every profile field exposed by the form");
assert.ok(profileMigration.includes("platform_update_institution(") && profileMigration.includes("platform_list_institutions("), "Institution profile migration must persist and return the complete profile");
assert.ok(superadminTestRunner.includes("20261125203000_expand_institution_profiles_and_branding.sql"), "Ephemeral PostgreSQL suite must apply the profile migration before assertions");
assert.ok(postgresFixture.includes("CREATE SCHEMA IF NOT EXISTS storage") && postgresFixture.includes("CREATE TABLE IF NOT EXISTS storage.buckets"), "Ephemeral fixture must provide the isolated storage bucket catalog");
assert.ok(postgresAssertions.includes("institution profile update did not persist the complete synthetic profile"), "Ephemeral suite must test profile persistence");
assert.ok(postgresAssertions.includes("institution inventory did not return the complete profile to the console"), "Ephemeral suite must test profile inventory fields");
assert.ok(!api.includes("supabase: [") && !api.includes("render: ["), "Copilot must not generate hosted Supabase or Render execution steps");
assert.ok(!api.includes("create_pull_request"), "Copilot prompt and allowlist must prohibit pull requests");
assert.ok(adminInviteMigration.includes("private.require_platform_superadmin()") && adminInviteMigration.includes("'invited'"), "Global administrator invitation must create a pending membership under trusted Superadmin authority");
assert.ok(adminInviteMigration.includes("private.platform_idempotency_claim") && adminInviteMigration.includes("platform_audit_append("), "Administrator invitation must be idempotent and audited");
assert.ok(adminInviteMigration.includes("revoke all on function public.platform_invite_institution_admin(uuid,uuid,text,text,text) from public,anon"));
assert.ok(adminInviteMigration.includes("grant execute on function public.platform_invite_institution_admin(uuid,uuid,text,text,text) to authenticated"));
assert.ok(api.includes("inviteUserByEmail") && api.includes("platform_invite_institution_admin") && api.includes("admin.auth.admin.deleteUser"), "Server route must send Auth invite, persist pending membership and compensate on failure");
assert.ok(api.includes("EDUNEXA_APP_URL"), "Invitation redirect must use an explicit server-configured application URL");
assert.ok(institutionAdminsPanel.includes("/administrators/invite") && institutionAdminsPanel.includes("Enviar invitación"));
assert.ok(institutionAdminsPanel.includes("Pendiente de aprobación"), "New administrator invitations must remain visibly pending until institution approval");
assert.ok(superadminTestRunner.includes("20261126170000_platform_admin_invitation.sql"), "Ephemeral suite must apply the admin invitation migration");
assert.ok(postgresAssertions.includes("institution administrator invitation must be idempotent and remain pending"), "Ephemeral suite must test pending invitation idempotency");
assert.ok(postgresAssertions.includes("institution administrator invitation must create a pending role assignment and audit event"), "Ephemeral suite must test invitation role and audit");
assert.ok(consoleSource.includes('href="#global-audit"'), "Audit card must navigate to its functional panel");

assert.equal((scopedMigration.split("as " + String.fromCharCode(36,36)).length - 1) + (scopedMigration.split("do " + String.fromCharCode(36,36)).length - 1), (scopedMigration.split(String.fromCharCode(36,36) + ";").length - 1), "Scoped support migration dollar quotes must be balanced");
const scopedFunctions = [...scopedMigration.matchAll(/create or replace function public\.(platform_[a-z_]+)/g)].map((match) => match[1]);
for (const name of scopedFunctions) {
  assert.ok(scopedMigration.includes("revoke all on function public." + name + "("), name + " must revoke default PUBLIC execution");
  assert.ok(scopedMigration.includes("grant execute on function public." + name + "("), name + " must grant explicit authenticated execution");
}

const adminApprovalMigration = read("../supabase/migrations/20261126180000_platform_admin_invitation_approval.sql");
const adminApprovalRoute = read("../src/app/api/institution/administrator-invitations/[membershipId]/approve/route.ts");
assert.ok(adminApprovalMigration.includes("active_institution_admin_required"), "Invitation approval must require an active institution admin");
assert.ok(adminApprovalMigration.includes("self_approval_forbidden"), "Invitees must not approve their own memberships");
assert.ok(adminApprovalMigration.includes("platform.institution.admin.approve"), "Institutional approval must append an audit event");
assert.ok(adminApprovalMigration.includes("grant execute on function public.platform_approve_institution_admin(uuid,uuid,text) to authenticated"));
assert.ok(adminApprovalRoute.includes('rpcClient.rpc("platform_approve_institution_admin"'), "Authenticated API must call the institution-scoped approval RPC");
assert.ok(adminApprovalRoute.includes('request.headers.get("origin")'), "Invitation approval writes must enforce same-origin requests");
assert.ok(superadminTestRunner.includes("20261126180000_platform_admin_invitation_approval.sql"), "Ephemeral PostgreSQL suite must apply invitation approval migration");
assert.ok(postgresAssertions.includes("institution admin approval must activate the invited membership and append an audit event"));
assert.ok(postgresAssertions.includes("expected invitee self-approval denial"));
assert.ok(postgresAssertions.includes("expected cross-tenant invitation approval denial"));
assert.ok(postgresAssertions.includes("independently approved Superadmin revocation did not complete"));
assert.ok(postgresAssertions.includes("second Superadmin revocation failed or changed the remaining global operators"));
