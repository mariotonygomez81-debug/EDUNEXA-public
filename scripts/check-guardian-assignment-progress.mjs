import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync("docs/database/guardian-assignment-progress.draft.sql", "utf8");
const portal = readFileSync("src/app/dashboard/[slug]/portal/page.tsx", "utf8");
const permissionHelper = readFileSync("supabase/migrations/20261120030658_create_private_permission_helpers.sql", "utf8");
const studentScope = readFileSync("supabase/migrations/20261120035955_enable_scoped_academic_access.sql", "utf8");
const classroomCapabilities = readFileSync("supabase/migrations/20261120042419_define_scoped_classroom_capabilities.sql", "utf8");
const latestClassroomScope = readFileSync("supabase/migrations/20261122001943_classroom_teacher_delegated_permissions.sql", "utf8");
const checks = [
  ["artifact is explicitly a draft, not an executable migration",
    /^-- DRAFT ONLY — NOT A SUPABASE MIGRATION\./m.test(sql) &&
    /supabase migration new guardian_assignment_progress/.test(sql)],
  ["private implementation requires an authenticated user and active guardian membership",
    /auth\.uid\(\)/.test(sql) && /m\.status = 'active'/.test(sql) &&
    /r\.key = 'guardian'/.test(sql)],
  ["requested child is explicitly linked to the authenticated guardian",
    /sg\.student_id = p_student_id/.test(sql) &&
    /g\.membership_id = v_membership_id/.test(sql)],
  ["progress is restricted to current active enrollment",
    /e\.status = 'active'/.test(sql) && /e\.enrolled_on <= current_date/.test(sql) &&
    /e\.ended_on is null or e\.ended_on >= current_date/.test(sql)],
  ["institution permission helper uses active membership, auth.uid and role_permissions",
    /m\.user_id = \(select auth\.uid\(\)\)/.test(permissionHelper) &&
    /m\.status = 'active'/.test(permissionHelper) &&
    /public\.role_permissions/.test(permissionHelper) &&
    /p\.key = p_permission_key/.test(permissionHelper)],
  ["guardian classroom.read is granted and scoped to a linked child with active enrollment",
    /p\.key = 'classroom\.read'[\s\S]*?r\.key IN \('institution_admin', 'teacher', 'director', 'student', 'guardian'\)/.test(classroomCapabilities) &&
    /r\.key='guardian'[\s\S]*?p_permission_key='classroom\.read'[\s\S]*?sg\.student_id[\s\S]*?e\.status='active'/.test(latestClassroomScope) &&
    !/assigned_cs/.test(latestClassroomScope)],
  ["grades.read is checked together with the guardian's per-child can_view_grades flag",
    /private\.has_institution_permission\(p_institution_id, p_permission_key\)/.test(studentScope) &&
    /p_permission_key = 'grades\.read' and sg\.can_view_grades/.test(studentScope)],
  ["only already-published tasks are returned with explicit classroom.read permission",
    /a\.published_at is not null/.test(sql) &&
    /a\.published_at <= now\(\)/.test(sql) &&
    /private\.has_institution_permission\(p_institution_id, 'classroom\.read'\)/.test(sql) &&
    !/private\.can_access_classroom/.test(sql)],
  ["grades are individually gated by the linked guardian-child permission",
    /sg\.can_view_grades/.test(sql) &&
    /private\.can_access_student\([\s\S]*'grades\.read'/.test(sql) &&
    /when sg\.can_view_grades and v_can_view_grades then sub\.score/.test(sql) &&
    /when sg\.can_view_grades and v_can_view_grades then a\.max_score/.test(sql) &&
    /sg\.can_view_grades and v_can_view_grades/.test(sql)],
  ["result includes task, subject, due date, submission and review status",
    /subject_name text/.test(sql) && /assignment_title text/.test(sql) &&
    /due_at timestamptz/.test(sql) && /submitted_at timestamptz/.test(sql) &&
    /review_status text/.test(sql)],
  ["public RPC is SECURITY INVOKER and restricted to authenticated",
    /public\.list_my_child_assignment_progress[\s\S]*security invoker/i.test(sql) &&
    /from public, anon;[\s\S]*grant execute[\s\S]*to authenticated/i.test(sql)],
  ["private submission content and teacher feedback are not returned",
    !/^\s*(body|file_path|feedback|instructions)\s+(text|varchar)/mi.test(sql) &&
    /Deliberately absent from the result:[\s\S]*submission body[\s\S]*teacher feedback/.test(sql)],
  ["published report-card history follows snapshot RLS audience independently of grades.read",
    /Snapshot RLS already filters by the account's report-card audience/.test(portal) &&
    /const academicHistory = buildPublishedAcademicHistory\(studentReportCards\);/.test(portal) &&
    !/student\.can_view_grades\s*\?\s*buildPublishedAcademicHistory/.test(portal) &&
    /La institución no habilitó la consulta de calificaciones para esta cuenta\./.test(portal)],
  ["no write operation or production target is present",
    !/\b(insert into|update public\.|delete from|alter table)\b/i.test(sql) &&
    /Never apply this draft to production/.test(sql)],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`✓ ${name}`);
}
console.log(`Passed ${checks.length} static guardian-progress checks.`);
