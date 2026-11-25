import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const dashboard = read("src/app/dashboard/[slug]/page.tsx");
const portal = read("src/app/dashboard/[slug]/portal/page.tsx");
const attendance = read("src/app/dashboard/[slug]/portal/attendance/[studentId]/page.tsx");
const notifications = read("src/app/dashboard/[slug]/notifications/page.tsx");
const portalNotifications = portal;
const notificationActions = read("src/app/dashboard/[slug]/notifications/actions.ts");
const messages = read("src/app/dashboard/[slug]/messages/page.tsx");
const conversation = read("src/app/dashboard/[slug]/messages/[conversationId]/page.tsx");
const appointments = read("src/app/dashboard/[slug]/appointments/page.tsx");
const progressDraft = read("docs/database/guardian-assignment-progress.draft.sql");
const studentScope = read("supabase/migrations/20261120035955_enable_scoped_academic_access.sql");
const reportCardAudience = read("supabase/migrations/20261124010000_report_card_audience_permissions.sql");

const checks = [
  ["portal: authentication, active membership and student/guardian role are enforced",
    /supabase\.auth\.getUser\(\)/.test(portal) &&
    /\.eq\("status", "active"\)/.test(portal) &&
    /roleKeys\.includes\("guardian"\)/.test(portal) &&
    !/roleKeys\.includes\("student"\)/.test(portal) &&
    /list_my_portal_students/.test(portal)],
  ["tareas/progreso: portal calls child-scoped progress RPC for each linked child",
    /students\.filter\(\(student\) => !student\.is_self\)/.test(portal) &&
    /list_my_child_assignment_progress/.test(portal) &&
    /p_student_id: student\.student_id/.test(portal) &&
    /a\.published_at is not null/.test(progressDraft) &&
    /sg\.student_id = p_student_id/.test(progressDraft)],
  ["boletines: only published snapshots for linked students are loaded and rendered per child",
    /from\("report_card_snapshots"\)/.test(portal) &&
    /\.in\("student_id", portalStudentIds\)/.test(portal) &&
    /publishedReportCards\.filter\(\(card\) => card\.student_id === student\.student_id\)/.test(portal) &&
    /report-cards-\$\{student\.student_id\}/.test(portal) &&
    /portal#report-cards-\$\{student\.student_id\}/.test(portal)],
  ["calificaciones: task grades use per-child permission and published report cards use their separate audience RLS",
    /when sg\.can_view_grades and v_can_view_grades then sub\.score/.test(progressDraft) &&
    /p_permission_key = 'grades\.read' and sg\.can_view_grades/.test(studentScope) &&
    /can_view_report_cards/.test(reportCardAudience) &&
    /private\.can_view_report_card/.test(reportCardAudience) &&
    /Snapshot RLS already filters by the account's report-card audience/.test(portal) &&
    /const academicHistory = buildPublishedAcademicHistory\(studentReportCards\);/.test(portal) &&
    !/student\.can_view_grades\s*\?\s*buildPublishedAcademicHistory/.test(portal)],
  ["asistencia: linked student and can_view_attendance are checked before attendance RPC",
    /list_my_portal_students/.test(attendance) &&
    /row\.student_id === studentId && row\.can_view_attendance/.test(attendance) &&
    /list_my_student_attendance/.test(attendance) &&
    /role === "student" \|\| role === "guardian"/.test(attendance)],
  ["notificaciones: dashboard badge and personal inbox are scoped to recipient membership",
    /recipient_membership_id", membership\.id/.test(dashboard) &&
    /recipient_membership_id", membership\.id/.test(notifications) &&
    /recipient_membership_id", membership\.id/.test(portal) &&
    /mark_notification_read/.test(notificationActions) &&
    /set_notification_preference/.test(notificationActions)],
  ["mensajes: contacts, conversations and messages use membership-scoped RPCs",
    /list_messageable_contacts/.test(messages) &&
    /list_my_conversations/.test(messages) &&
    /list_my_conversations/.test(conversation) &&
    /list_conversation_messages/.test(conversation) &&
    /\.find\(\(item\) => item\.conversation_id === conversationId\)/.test(conversation)],
  ["notificaciones: tareas y boletines del estudiante/tutor abren el portal autorizado, no pantallas de otros perfiles",
    notifications.includes('const isStudentOrGuardian = roleKeys.some((role) => role === "student" || role === "guardian");') &&
    notifications.includes('isStudentOrGuardian ? `/dashboard/${slug}/portal` : `/dashboard/${slug}/student/tasks`') &&
    notifications.includes('isStudentOrGuardian ? `/dashboard/${slug}/portal` : `/dashboard/${slug}/report-cards`') &&
    portalNotifications.includes('if (item.resource_type === "report_card" || item.notification_type === "report_card" || item.notification_type === "grade") return `/dashboard/${slug}/portal`;') &&
    portalNotifications.includes('if (item.resource_type === "assignment") return `/dashboard/${slug}/portal`;')],
  ["citaciones: guardian role selects the guardian-specific appointments RPC",
    /roles\.includes\("guardian"\)/.test(appointments) &&
    /const isGuardian = roles\.includes\("guardian"\)/.test(appointments) &&
    /const isTeacher = roles\.includes\("teacher"\)/.test(appointments) &&
    /const isPrefect = roles\.includes\("prefect"\)/.test(appointments) &&
    /isGuardian\s*\?\s*await supabase\.rpc\("list_guardian_teacher_appointments"\)/.test(appointments) &&
    /isPrefect\s*\?\s*await supabase\.rpc\("list_prefect_guardian_appointments"\)/.test(appointments) &&
    /list_teacher_guardian_appointments/.test(appointments) &&
    /if \(!isGuardian && !isTeacher && !isPrefect\)/.test(appointments)],
];

for (const [name, passed] of checks) {
  assert.ok(passed, name);
  console.log(`✓ ${name}`);
}
console.log(`Passed ${checks.length} static Tutor integration checks across eight areas. No hosted database or production service is accessed.`);
