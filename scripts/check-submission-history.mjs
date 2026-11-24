import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261124040000_submission_file_history_audit.sql",
  "utf8",
).toLowerCase();
const reader = readFileSync(
  "supabase/migrations/20261124030000_scoped_submission_history_reader.sql",
  "utf8",
).toLowerCase();
const fileListing = readFileSync(
  "supabase/migrations/20261120213440_add_scoped_classroom_file_listing.sql",
  "utf8",
).toLowerCase();
const roster = readFileSync(
  "src/app/dashboard/[slug]/classroom/[classroomId]/submission-roster.tsx",
  "utf8",
).toLowerCase();

const checks = [
  ["File audit table is scoped to institution and submission", /create table public\.submission_file_events[\s\S]*institution_id uuid not null[\s\S]*submission_id uuid not null[\s\S]*file_id uuid not null unique/],
  ["File audit table has RLS and no client grants", /alter table public\.submission_file_events enable row level security[\s\S]*revoke all on table public\.submission_file_events from public, anon, authenticated, service_role/],
  ["Client policy explicitly denies direct file-history access", /create policy submission_file_events_deny_client_access[\s\S]*for all to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/],
  ["File events are append-only", /create trigger submission_file_events_append_only[\s\S]*before update or delete/],
  ["Finalized submission uploads generate an audit event", /create trigger classroom_file_objects_capture_submission_event[\s\S]*after update of status/],
  ["Audit event only records finalized submission files", /new\.purpose = 'submission'[\s\S]*new\.status = 'ready'/],
  ["Existing ready and superseded attachments are backfilled", /where f\.purpose = 'submission'[\s\S]*f\.status in \('ready', 'superseded'\)/],
  ["Historical submission files remain readable only through classroom scope", /f\.status in \('ready', 'superseded'\)[\s\S]*private\.can_access_submission\(s\.id, f\.institution_id, 'classroom\.read'\)/],
  ["Materials retain their current-file restriction", /f\.purpose = 'material'[\s\S]*f\.status = 'ready'[\s\S]*cm\.file_path = f\.object_path/],
  ["History reader checks grading permission", /private\.can_access_submission\(p_submission_id, v_institution_id, 'classroom\.grade'\)/],
  ["History reader returns attachment audit metadata", /'files',[\s\S]*'file_id',[\s\S]*'original_filename',[\s\S]*'changed_at'/],
  ["History reader uses a locked search path", /security definer[\s\S]*set search_path = ''/],
  ["File listing delegates to the scoped file-read helper", /private\.can_read_classroom_file\(f\.bucket_id, f\.object_path\)/],
  ["Teacher UI renders file audit events", /const fileevents = history\?\.files \?\? \[\]/],
  ["Teacher UI resolves file links by exact file ID", /files\.find\(\(item\) => item\.file_id === event\.file_id\)/],
];

const failed = checks.filter(([, pattern]) => !pattern.test(
  pattern === undefined ? "" : (
    checks.indexOf(checks.find(([, p]) => p === pattern)) < 0 ? "" :
    pattern === checks[12][1] ? fileListing :
    pattern === checks[13][1] || pattern === checks[14][1] ? roster :
    pattern === checks[9][1] || pattern === checks[10][1] || pattern === checks[11][1] ? reader :
    migration
  ),
));
for (const [label, pattern] of checks) {
  const source = pattern === checks[12][1] ? fileListing
    : pattern === checks[13][1] || pattern === checks[14][1] ? roster
    : pattern === checks[9][1] || pattern === checks[10][1] || pattern === checks[11][1] ? reader
    : migration;
  console.log(`${pattern.test(source) ? "PASS" : "FAIL"} ${label}`);
}
if (failed.length) {
  console.error(`\\n${failed.length} submission-history check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\\nAll ${checks.length} submission-history safeguards passed.`);
}
