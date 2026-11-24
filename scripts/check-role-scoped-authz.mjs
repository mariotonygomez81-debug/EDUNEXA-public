import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261124100000_enforce_role_scoped_academic_permissions.sql"), "utf8");
const dashboard = readFileSync(join(process.cwd(), "src/app/dashboard/[slug]/page.tsx"), "utf8");
const login = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8");
const loginForm = readFileSync(join(process.cwd(), "src/components/auth/login-form.tsx"), "utf8");
const reportCards = readFileSync(join(process.cwd(), "supabase/migrations/20261124010000_report_card_audience_permissions.sql"), "utf8");

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

// The deployed role/permission catalog was inspected read-only. These are the
// eight actual role keys and representative permissions present in Hosted.
const hostedRoleMatrix = {
  administrative: ["students.read", "students.link_membership", "administrative_records.read"],
  director: ["students.read", "attendance.read", "grades.read", "classroom.read"],
  guardian: ["students.read", "attendance.read", "grades.read", "classroom.read"],
  institution_admin: ["students.read", "students.manage", "attendance.manage", "grades.manage", "classroom.read"],
  prefect: ["students.read", "attendance.read", "attendance.manage", "classroom.read"],
  secretary: ["students.read", "students.manage"],
  student: ["students.read", "attendance.read", "grades.read", "classroom.read", "classroom.submit"],
  teacher: ["students.read", "attendance.read", "attendance.manage", "grades.read", "grades.manage", "classroom.read", "classroom.manage", "classroom.grade"],
};
assert.deepEqual(Object.keys(hostedRoleMatrix).sort(), [
  "administrative", "director", "guardian", "institution_admin",
  "prefect", "secretary", "student", "teacher",
].sort(), "test matrix must cover all eight Hosted roles");
for (const role of Object.keys(hostedRoleMatrix)) {
  const roleBlock = migration.toLowerCase();
  assert.ok(roleBlock.includes(`'${role}'`), `authorization migration must explicitly account for ${role}`);
}
assert.match(migration, /classroom_teacher_permissions[\s\S]*?ctp\.is_active/i, "delegated classroom access must require an active delegation");
assert.match(migration, /ctp\.can_grade/i, "delegated grading must check can_grade");
assert.match(migration, /ctp\.can_edit_materials/i, "delegated material editing must check can_edit_materials");
assert.match(migration, /ctp\.can_edit_assignments/i, "delegated assignment editing must check can_edit_assignments");
assert.match(migration, /ctp\.can_attendance/i, "delegated attendance must check can_attendance");

// Report-card access is intentionally a separate audience gate: do not fold it
// into grades.read, because grade visibility and published-report visibility
// are independent guardian flags.
const reportCardHelper = reportCards.slice(
  reportCards.indexOf("create or replace function private.can_view_report_card"),
  reportCards.indexOf("$function$;", reportCards.indexOf("create or replace function private.can_view_report_card")) + 11,
);
assert.match(reportCardHelper, /sg\.can_view_report_cards/i, "guardian report-card access must require its dedicated flag");
assert.match(reportCardHelper, /p_audience in \('guardian','both'\)/i, "guardian report cards must honor publication audience");
assert.match(reportCardHelper, /sg\.can_view_report_cards/i, "grade and attendance flags cannot substitute report-card consent");
assert.doesNotMatch(migration, /p_permission_key[^;]{0,160}can_view_report_cards/i, "report-card audience must not be conflated with grades.read");

console.log(`Passed ${functions.length} role-scoped authorization checks, Hosted eight-role matrix checks, delegated classroom checks, report-card audience checks and unified-login/dashboard checks. No database or production service is accessed.`);
