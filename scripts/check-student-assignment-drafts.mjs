import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261124050000_student_assignment_drafts.sql", "utf8");
const rpcGrant = readFileSync("supabase/migrations/20261124051000_restore_submission_rpc_execute.sql", "utf8");
const editor = readFileSync("src/app/dashboard/[slug]/classroom/[classroomId]/student-assignment-editor.tsx", "utf8");

const checks = [
  ["draft table is isolated and RLS-enabled", /CREATE TABLE public\.student_assignment_drafts/.test(migration) && /ALTER TABLE public\.student_assignment_drafts ENABLE ROW LEVEL SECURITY/.test(migration)],
  ["direct client access is denied", /student_assignment_drafts_deny_direct_client_access[\s\S]*USING \(false\)[\s\S]*WITH CHECK \(false\)/.test(migration) && /REVOKE ALL ON TABLE public\.student_assignment_drafts FROM PUBLIC, anon, authenticated, service_role/.test(migration)],
  ["draft reads and writes validate the signed-in student and classroom submission permission", /auth\.uid\(\)/.test(migration) && /private\.can_submit_to_assignment/.test(migration) && /cm\.member_role = 'student'/.test(migration)],
  ["optimistic concurrency uses an expected revision and returns conflicts", /p_expected_revision integer/.test(migration) && /d\.revision = p_expected_revision/.test(migration) && /'conflict', true/.test(migration)],
  ["draft HTML has size and active-content guards", /octet_length\(p_html\) > 5242880/.test(migration) && migration.includes("p_html ~* '<(script|iframe") && /javascript/.test(migration)],
  ["official submission removes only the matching student's private draft", /DELETE FROM public\.student_assignment_drafts[\s\S]*assignment_id = p_assignment_id[\s\S]*student_id = v_student_id/.test(migration)],
  ["the existing submission RPC can still invoke its protected implementation", /GRANT EXECUTE ON FUNCTION private\.submit_classroom_assignment_impl\(uuid, text\) TO authenticated/.test(rpcGrant)],
  ["editor restores cloud drafts and sanitizes restored HTML", /get_my_student_assignment_draft/.test(editor) && /sanitizeDraftHtml\(remote\.html\)/.test(editor)],
  ["editor saves drafts with revision checks and exposes explicit conflict resolution", /save_my_student_assignment_draft/.test(editor) && /p_expected_revision: draftRevisionRef\.current/.test(editor) && /Conservar mi versión/.test(editor) && /Cargar versión del servidor/.test(editor)],
  ["local session backup remains available when cloud saving fails", /sessionStorage\.setItem\(draftKey/.test(editor) && /tu copia local sigue disponible/.test(editor)],
];

let failed = false;
for (const [label, passed] of checks) {
  process.stdout.write(`${passed ? "PASS" : "FAIL"} ${label}\n`);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
process.stdout.write(`Validated ${checks.length} student draft persistence security checks.\n`);
