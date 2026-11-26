import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const base = read("../supabase/migrations/20261125230425_superadmin_global_control_plane.sql");
const execution = read("../supabase/migrations/20261125230430_superadmin_execution_layer.sql");
const scope = read("../supabase/migrations/20261125230434_superadmin_module_scoped_support_and_config_sync.sql");
const profile = read("../supabase/migrations/20261126010152_expand_institution_profiles_and_branding.sql");
const invite = read("../supabase/migrations/20261126170000_platform_admin_invitation.sql");
const approval = read("../supabase/migrations/20261126180000_platform_admin_invitation_approval.sql");
const emailTypes = read("../supabase/migrations/20261126190000_platform_auth_email_return_types.sql");
const lifecycle = read("../supabase/migrations/20261126200000_superadmin_audit_and_admin_lifecycle.sql");
const api = read("../src/app/api/platform/[...segments]/route.ts");
const ops = read("../src/components/admin/platform-operations-panel.tsx");
const admins = read("../src/components/admin/platform-institution-admins-panel.tsx");
const governance = read("../src/components/admin/platform-governance-panel.tsx");
const page = read("../src/app/dashboard/platform/page.tsx");
const dashboard = read("../src/app/dashboard/page.tsx");

for (const token of ["private.require_platform_superadmin", "raw_app_meta_data ->> 'platform_role'",
  "private.platform_audit_events", "platform_audit_no_update_delete", "platform_create_institution",
  "platform_assign_institution_admin", "platform_revoke_institution_admin"]) {
  assert.ok(base.includes(token), "Missing global control: " + token);
}
assert.ok(!base.includes("user_metadata"), "Global privilege must never trust user_metadata");
assert.ok(base.includes("platform_approve_delegation"), "Delegation approval must be a database-enforced second-person action");
for (const token of ["platform_request_delegation_idempotent",
  "expires_at", "approved_by", "for update skip locked"]) {
  assert.ok(execution.includes(token), "Missing execution/delegation control: " + token);
}
assert.ok(scope.includes("platform_delegations_module_scope_check"));
assert.ok(scope.includes("cardinality(module_scope) between 1 and 7"));
assert.ok(profile.includes("institutions_contact_email_format"));
assert.ok(profile.includes("platform_update_institution"));
assert.ok(invite.includes("platform_invite_institution_admin"));
assert.ok(invite.includes("values(p_institution_id,p_user_id,'invited')"));
assert.ok(approval.includes("platform_approve_institution_admin"));
assert.ok(approval.includes("actor_membership.institution_id=p_institution_id"));
assert.ok(approval.includes("self_approval_forbidden"));
assert.ok(emailTypes.includes("u.email::text"));
for (const token of ["platform_update_institution_admin", "platform_set_institution_admin_status",
  "cannot_suspend_last_institution_admin", "platform_get_audit_event", "platform_institution_admin_overrides"]) {
  assert.ok(lifecycle.includes(token), "Missing administrator lifecycle control: " + token);
}
for (const token of ["platform_request_delegation_scoped_idempotent", "platform_approve_delegation",
  "platform_invite_institution_admin", "platform_update_institution_admin",
  "platform_set_institution_admin_status", "platform_revoke_institution_admin"]) {
  assert.ok(api.includes(token), "Missing Superadmin API operation: " + token);
}
assert.ok(api.includes("requirePlatformSuperadmin(request, write)"));
assert.ok(api.includes("requiredReason(body.reason)"));
assert.ok(api.includes("body.expiresAt"));
assert.ok(api.includes("body.moduleScopes"));
assert.ok(ops.includes("Segundo Superadministrador") || ops.includes("segundo Superadministrador"));
assert.ok(ops.includes("expires_at"));
assert.ok(admins.includes("expectedUpdatedAt"));
assert.ok(governance.includes("approved_by_email"));
assert.ok(page.includes("isPlatformSuperAdmin(user)"));
assert.ok(dashboard.includes('redirect("/dashboard/platform")'));
console.log("PASS: Superadmin global authorization, institution administration, two-person delegation, expiry and audit contracts.");
