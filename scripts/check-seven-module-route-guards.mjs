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
const studentProfile = read("src/app/dashboard/[slug]/student/profile/page.tsx");
const studentTasks = read("src/app/dashboard/[slug]/student/tasks/page.tsx");
const guardianAttendance = read("src/app/dashboard/[slug]/portal/attendance/[studentId]/page.tsx");
const gradesPage = read("src/app/dashboard/[slug]/grades/page.tsx");
const attendancePage = read("src/app/dashboard/[slug]/attendance/page.tsx");
const reportCardsPage = read("src/app/dashboard/[slug]/report-cards/page.tsx");
const messagesActions = read("src/app/dashboard/[slug]/messages/actions.ts");
const reportActions = read("src/app/dashboard/[slug]/report-cards/actions.ts");
const announcementsActions = read("src/app/dashboard/[slug]/announcements/actions.ts");
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
  assert.ok(source.includes('.eq("status", "active")'), name + ": active institution/membership guard missing");
}
assert.ok(workspace.includes('.eq("status", "active").maybeSingle()'), "inactive institution must not open");
assert.ok(workspace.includes("module.permissions.every"), "navigation must require every declared permission");
assert.ok(workspace.includes("roleKeys.includes(module.role)"), "navigation must match institutional role");
assert.ok(!tutor.includes('role === "student"'), "student access belongs to the separate student workspace");
for (const [name, source] of [["perfil de alumno", studentProfile], ["tareas de alumno", studentTasks], ["asistencia de tutor", guardianAttendance], ["calificaciones", gradesPage], ["asistencia", attendancePage], ["boletines", reportCardsPage]]) {
  assert.ok(source.includes('.eq("status", "active")'), name + ": route must reject inactive institutions");
}
assert.ok(student.includes('.eq("recipient_membership_id", membership.id)'), "student notification count must be membership-scoped");
const slash = String.fromCharCode(92);
const validDatePattern = "!/^" + slash + "d{4}-" + slash + "d{2}-" + slash + "d{2}T" + slash + "d{2}:" + slash + "d{2}$/.test(scheduledRaw)";
const doubleEscapedDatePattern = "!/^" + slash + slash + "d{4}";
assert.ok(appointment.includes(validDatePattern), "appointment datetime regex must use single escapes");
assert.ok(!appointment.includes(doubleEscapedDatePattern), "appointment datetime regex must not match literal backslash-d");
assert.ok(appointment.includes("create_teacher_guardian_appointment"));
assert.ok(appointment.includes("auth.getUser()"));
assert.ok(prefectAttendance.includes('permissions.has("attendance.manage")'));
assert.ok(prefectAttendance.includes('assignment_type","prefect"'));
assert.ok(attendance.includes('permissions.has("attendance.manage")'));
assert.ok(attendance.includes("canManageDivision"));
assert.ok(attendance.includes('.from("course_subjects")'), "subject-based staff assignments must grant attendance only within their course");
assert.ok(grades.includes('permissions.has("grades.manage")'));
assert.ok(reportWorkflow.includes('"report_cards.approve"'));
assert.ok(reportWorkflow.includes('"report_cards.publish"'));
assert.ok(studentActions.includes('permissions.has("students.manage")'));
assert.ok(administrativeActions.includes('permissions.has("administrative_records.manage")'));
for (const [name, source] of [["calificaciones", grades], ["alumnos", studentActions], ["asistencia", attendance], ["mensajes", messagesActions], ["boletines", reportActions], ["anuncios", announcementsActions], ["citaciones", appointment]]) {
  assert.ok(source.includes('.eq("status", "active")'), name + ": writes must reject inactive institutions");
}
console.log("Passed seven institutional route guards, active institution/membership checks, role-permission navigation and representative write-action authorization checks.");
