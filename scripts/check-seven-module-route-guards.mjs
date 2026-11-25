import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const workspace = read("src/app/dashboard/[slug]/page.tsx");
const teaching = read("src/app/dashboard/[slug]/teaching/page.tsx");
const prefect = read("src/app/dashboard/[slug]/prefect/page.tsx");
const student = read("src/app/dashboard/[slug]/student/page.tsx");
const tutor = read("src/app/dashboard/[slug]/portal/page.tsx");
const direction = read("src/app/dashboard/[slug]/direction/page.tsx");
const administrative = read("src/app/dashboard/[slug]/administrative/page.tsx");
const adminCenter = read("src/app/dashboard/[slug]/admin-center/page.tsx");
const appointment = read("src/app/dashboard/[slug]/teaching/[divisionId]/actions.ts");
const prefectAttendance = read("src/app/dashboard/[slug]/prefect/attendance/actions.ts");
const attendance = read("src/app/dashboard/[slug]/attendance/actions.ts");
const grades = read("src/app/dashboard/[slug]/grades/actions.ts");
const reportWorkflow = read("src/app/dashboard/[slug]/report-cards/workflow-actions.ts");
const studentActions = read("src/app/dashboard/[slug]/students/actions.ts");
const administrativeActions = read("src/app/dashboard/[slug]/administrative/actions.ts");

const pages = [
  ["Docentes", teaching, 'row.roles?.key === "teacher"', 'permissions.has("classroom.read")'],
  ["Preceptor", prefect, 'row.roles?.key === "prefect"', 'permissions.has("attendance.read")'],
  ["Alumnos", student, 'roles.includes("student")', '.eq("status", "active")'],
  ["Tutor", tutor, 'roleKeys.includes("guardian")', '.eq("status", "active")'],
  ["Directivos", direction, 'role==="director" || role==="institution_admin"', 'permissions.has("grades.read")'],
  ["Administrativos", administrative, 'permissions.has("administrative_records.read")', 'permissions.has("administrative_records.manage")'],
  ["Administrador", adminCenter, 'row.roles?.key === "institution_admin"', 'permissions.has("institution.manage")'],
];
for (const [name, source, roleGuard, permissionGuard] of pages) {
  assert.ok(source.includes(roleGuard), name + ": role guard missing");
  assert.ok(source.includes(permissionGuard), name + ": permission guard missing");
  assert.ok(source.includes("auth.getUser()"), name + ": server authentication missing");
  assert.ok(source.includes('.eq("status", "active")'), name + ": active membership/institution guard missing");
}
assert.ok(workspace.includes('.eq("status", "active").maybeSingle()'), "institution workspace must reject inactive institutions");
assert.ok(workspace.includes("module.permissions.every"), "navigation must require all module permissions");
assert.ok(workspace.includes("roleKeys.includes(module.role)"), "navigation must match the institution role");
assert.ok(!tutor.includes('role === "student"'), "student access belongs to the separate student workspace");

assert.ok(appointment.includes(String.raw\`!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledRaw)\`), "appointment datetime regex must use single escapes");
assert.ok(!appointment.includes(String.raw\`/^\\d{4}\`), "appointment datetime regex must not match literal backslash-d");
assert.ok(appointment.includes("create_teacher_guardian_appointment"));
assert.ok(prefectAttendance.includes('permissions.has("attendance.manage")'));
assert.ok(prefectAttendance.includes('assignment_type","prefect"'));
assert.ok(attendance.includes('permissions.has("attendance.manage")'));
assert.ok(attendance.includes("canManageDivision"));
assert.ok(grades.includes('permissions.has("grades.manage")'));
assert.ok(reportWorkflow.includes('"report_cards.approve"'));
assert.ok(reportWorkflow.includes('"report_cards.publish"'));
assert.ok(studentActions.includes('permissions.has("students.manage")'));
assert.ok(administrativeActions.includes('permissions.has("administrative_records.manage")'));

console.log("Passed seven institutional route guards, active institution/membership checks, role-permission navigation and representative write-action authorization checks.");
