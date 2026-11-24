import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8").toLowerCase();
const audit = read("supabase/migrations/20261124040000_submission_file_history_audit.sql");
const history = read("supabase/migrations/20261124030000_scoped_submission_history_reader.sql");
const multi = read("supabase/migrations/20261124020000_preserve_multiple_submission_attachments.sql");
const scope = read("supabase/migrations/20261120042544_scope_classroom_submissions.sql");
const listing = read("supabase/migrations/20261120213440_add_scoped_classroom_file_listing.sql");
const roster = read("src/app/dashboard/[slug]/classroom/[classroomId]/submission-roster.tsx");
const editor = read("src/app/dashboard/[slug]/classroom/[classroomId]/student-assignment-editor.tsx");
const upload = read("src/app/dashboard/[slug]/classroom/[classroomId]/file-upload.tsx");

const checks = [
  ["Audit rows are institution/submission scoped", /create table public\.submission_file_events[\s\S]*institution_id uuid not null[\s\S]*submission_id uuid not null[\s\S]*file_id uuid not null unique/.test(audit)],
  ["Audit table has RLS and no direct client grants", /alter table public\.submission_file_events enable row level security[\s\S]*revoke all on table public\.submission_file_events from public, anon, authenticated, service_role/.test(audit)],
  ["Direct client access to audit rows is denied", /create policy submission_file_events_deny_client_access[\s\S]*for all to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/.test(audit)],
  ["Audit rows are append-only", /create trigger submission_file_events_append_only[\s\S]*before update or delete/.test(audit)],
  ["Retention FKs do not cascade into immutable audit rows", /institution_id uuid not null references public\.institutions\(id\) on delete restrict[\s\S]*file_id uuid not null unique references public\.classroom_file_objects\(id\) on delete restrict[\s\S]*references public\.submissions\(id, institution_id\) on delete restrict/.test(audit)],
  ["Actor identity is an immutable snapshot, not ON DELETE SET NULL", /changed_by uuid,[\s\S]*immutable actor snapshot/.test(audit)],
  ["Finalized uploads create file events", /create trigger classroom_file_objects_capture_submission_event[\s\S]*after update of status/.test(audit) && /new\.purpose = 'submission'[\s\S]*new\.status = 'ready'/.test(audit)],
  ["Existing ready/superseded submission files are backfilled", /where f\.purpose = 'submission'[\s\S]*f\.status in \('ready', 'superseded'\)/.test(audit)],
  ["Submission files remain readable only within classroom scope", /f\.purpose = 'submission'[\s\S]*private\.can_access_submission\(s\.id, s\.institution_id, 'classroom\.read'\)/.test(audit)],
  ["Unpublished material files remain hidden from students", /cm\.published_at is not null or private\.can_access_classroom\(f\.classroom_id, f\.institution_id, 'classroom\.manage'\)/.test(audit)],
  ["Material attachments still require the current material file path", /f\.purpose = 'material'[\s\S]*f\.status = 'ready'[\s\S]*cm\.file_path = f\.object_path/.test(audit)],
  ["Multiple submission attachments are not superseded", /submission files are independent attachments[\s\S]*do not overwrite submissions\.file_path or supersede earlier files/.test(multi)],
  ["History reader requires classroom grading permission", /private\.can_access_submission\(p_submission_id, v_institution_id, 'classroom\.grade'\)/.test(history)],
  ["Private history helper is not granted to authenticated", !/grant execute on function private\.get_submission_history_impl\(uuid\) to authenticated/.test(history)],
  ["History reader returns file metadata without storage paths", /'files',[\s\S]*'file_id',[\s\S]*'original_filename',[\s\S]*'byte_size'/.test(audit) && !/'object_path'/.test(audit.slice(audit.indexOf("'files'")))],
  ["Private history implementation is not directly granted to authenticated", !/grant execute on function private\.get_submission_history_impl\(uuid\) to authenticated/.test(audit)],
  ["Student file reads are limited to their own submission", /r\.key = 'student'[\s\S]*sm\.student_id = s\.student_id/.test(scope)],
  ["Teacher file reads require classroom read authorization", /r\.key in \('institution_admin', 'director', 'teacher'\)[\s\S]*private\.can_access_classroom\(vc\.id, vc\.institution_id, 'classroom\.read'\)/.test(scope)],
  ["File listing uses the scoped read helper", listing.includes("private.can_read_classroom_file(f.bucket_id,f.object_path)")],
  ["Teacher history UI renders file events", roster.includes("const fileevents = history?.files ?? []")],
  ["Teacher history UI resolves download by file ID", roster.includes("files.find((item) => item.file_id === event.file_id)")],
  ["Student editor generates a PDF", editor.includes("createtaskpdf") && editor.includes("application/pdf")],
  ["Student can select multiple attachment files", /type="file"[\s\S]*multiple[\s\S]*accept=/.test(upload)],
  ["Student editor uploads and finalizes the PDF through scoped RPCs", /create_classroom_file_upload_intent[\s\S]*storage\.from\("classroom-files"\)\.upload[\s\S]*finalize_classroom_file_upload/.test(editor)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} submission-history check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} submission-history safeguards passed.`);
}
