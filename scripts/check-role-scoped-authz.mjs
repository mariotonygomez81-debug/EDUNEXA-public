import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261124100000_enforce_role_scoped_academic_permissions.sql"), "utf8");
const dashboard = readFileSync(join(process.cwd(), "src/app/dashboard/[slug]/page.tsx"), "utf8");
const login = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8");
const loginForm = readFileSync(join(process.cwd(), "src/components/auth/login-form.tsx"), "utf8");

const functions = [
  "can_access_student",
  "can_access_classroom",
  "can_manage_division",
  "can_manage_course_subject",
];

for (const name of functions) {
  const start = migration.indexOf(`create or replace function private.${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = migration.indexOf("create or replace function private.", start + 1);
  const body = migration.slice(start, next === -1 ? migration.length : next);
  assert.match(body, /join public\.role_permissions rp on rp\.role_id = r\.id|join public\.role_permissions rp\s+on rp\.role_id = r\.id/i, `${name}: permission must belong to the contextual role`);
  assert.match(body, /join public\.permissions p on p\.id = rp\.permission_id|join public\.permissions p\s+on p\.id = rp\.permission_id/i, `${name}: permission catalog must be joined`);
  assert.doesNotMatch(body, /private\.has_institution_permission\s*\(/i, `${name}: do not borrow permission from another membership role`);
  assert.match(body, /m\.status\s*=\s*'active'/i, `${name}: active membership required`);
  assert.match(body, /m\.institution_id\s*=\s*p_institution_id|vc\.institution_id\s*=\s*p_institution_id/i, `${name}: institution boundary required`);
  assert.match(body, /security definer/i, `${name}: preserve reviewed execution mode`);
  assert.match(body, /set search_path to ''/i, `${name}: empty search_path required`);
}

assert.match(login, /LoginForm/, "single login route must render shared login form");
assert.match(loginForm, /signInWithPassword/, "shared login form must authenticate through Supabase Auth");
assert.match(dashboard, /roleKeys/, "institutional dashboard must resolve role-based navigation");
assert.match(dashboard, /Mi espacio de alumno/, "student module must be linked from institutional dashboard");
assert.match(dashboard, /Tutor|tutor|guardian/i, "guardian module must remain represented in shared dashboard");

console.log(`Passed ${functions.length} static role-scoped authorization checks and 4 unified-login/dashboard checks. No database or production service is accessed.`);
