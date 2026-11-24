import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync("docs/database/guardian-assignment-progress.draft.sql", "utf8");
const portal = readFileSync("src/app/dashboard/[slug]/portal/page.tsx", "utf8");
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
  ["published grade history is hidden unless can_view_grades is enabled",
    /student\.can_view_grades[\s\S]*?buildPublishedAcademicHistory\(studentReportCards\)/.test(portal) &&
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
