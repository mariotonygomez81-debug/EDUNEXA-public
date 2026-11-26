import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const confirm = read("../src/app/auth/confirm/route.ts");
const edge = read("../supabase/functions/manage-institution-users/index.ts");
const panel = read("../src/components/admin/institution-users-manager.tsx");
assert.ok(!confirm.includes("activate_self"), "Email confirmation must never activate institutional membership");
assert.ok(!confirm.includes("institutionSlug"), "Confirmation route must not invoke institution activation");
assert.match(edge, /action === "activate_self"[\s\S]*?return response\(\{ error:[\s\S]*?\}, 410/);
assert.match(edge, /action === "approve_invitation"[\s\S]*?target\.status !== "invited"/);
assert.match(edge, /getUserById\(target\.user_id\)/);
assert.match(edge, /invitedUser\.user\?\.email_confirmed_at/);
assert.match(edge, /\.eq\("status", "invited"\)[\s\S]*?select\("id"\)\.maybeSingle\(\)/);
assert.match(edge, /membership\.invitation_approved/);
assert.match(edge, /!\["active", "suspended"\]\.includes\(target\.status\)/);
assert.match(panel, /action: "approve_invitation"/);
assert.match(panel, /Aprobar acceso/);
assert.match(panel, /Pendiente de aprobación/);

const roleMutationBlock = edge.match(/if \(\["update_role", "update_roles"\]\.includes\(action\)\) \{([\\s\\S]*?)\\n    if \(action === "set_status"\)/);
assert.ok(roleMutationBlock, "Role update handler must exist");
assert.match(roleMutationBlock[1], /target\.status !== "active"/, "Role updates must reject every non-active membership");
assert.ok(roleMutationBlock[1].indexOf('target.status !== "active"') < roleMutationBlock[1].indexOf('from("membership_roles").delete()'), "Status guard must run before deleting existing roles");
assert.match(panel, /disabled=\{member\.status!==\"active\" \|\| busy===member\.membership_id\}/, "Role selector must be disabled unless membership is active");
assert.match(panel, /disabled=\{member\.status!==\"active\" \|\| busy===member\.membership_id \|\| !\(draftRoles\[member\.membership_id\]\?\.length\)\}/, "Save button must be disabled unless membership is active");
assert.match(panel, /disabled=\{member\.status!==\"active\" \|\| busy===member\.membership_id\}/, "Director subprofile selector must be disabled unless membership is active");
assert.match(panel, /status===\"invited\" \? <button[^>]*Aprobar acceso/, "Invitation approval action must remain available for invited memberships");

console.log("PASS: invitations require explicit approval; role assignments stay immutable until membership is active.");
