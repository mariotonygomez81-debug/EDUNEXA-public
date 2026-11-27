import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261121012945_match_classroom_role_and_enrollment_scope.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();
const required = [
  ["role-specific teacher assignment", /sa\.assignment_type\s*=\s*'teacher'/],
  ["teacher assignment start date", /sa\.starts_on\s+is\s+null\s+or\s+sa\.starts_on\s*<=\s*current_date/],
  ["teacher assignment end date", /sa\.ends_on\s+is\s+null\s+or\s+sa\.ends_on\s*>=\s*current_date/],
  ["division-wide assignment scope", /sa\.course_subject_id\s+is\s+null\s+and\s+sa\.division_id\s*=\s*vc\.division_id/],
  ["subject assignment exact division", /sa\.division_id\s*=\s*vc\.division_id[\s\S]*?sa\.course_subject_id\s*=\s*vc\.course_subject_id/],
  ["active student enrollment", /e\.status\s*=\s*'active'/],
  ["student enrollment start date", /e\.enrolled_on\s+is\s+null\s+or\s+e\.enrolled_on\s*<=\s*current_date/],
  ["student enrollment end date", /e\.ended_on\s+is\s+null\s+or\s+e\.ended_on\s*>=\s*current_date/],
  ["guardian is read-only", /r\.key\s*=\s*'guardian'[\s\S]*?p_permission_key\s*=\s*'classroom\.read'/],
  ["institution membership is active", /m\.status\s*=\s*'active'/],
  ["effective institution permission", /private\.has_institution_permission\(p_institution_id,\s*p_permission_key\)/],
  ["public and anon execution revoked", /revoke\s+all\s+on\s+function\s+private\.can_access_classroom\([\s\S]*?from\s+public,\s*anon/],
  ["authenticated execution granted", /grant\s+execute\s+on\s+function\s+private\.can_access_classroom\([\s\S]*?to\s+authenticated/],
];
const failures = required.filter(([, pattern]) => !pattern.test(sql)).map(([label]) => label);
if (failures.length) {
  process.stderr.write(`Classroom scope migration is missing safeguards:\\n- ${failures.join("\\n- ")}\\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${required.length} classroom authorization safeguards.\\n`);
}
