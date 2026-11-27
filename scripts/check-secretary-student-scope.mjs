import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const secretaryRole = readFileSync(
  "supabase/migrations/20261121012613_add_secretary_institution_role.sql",
  "utf8",
);
const studentScope = readFileSync(
  "supabase/migrations/20261120035955_enable_scoped_academic_access.sql",
  "utf8",
);
const fix = readFileSync(
  "supabase/migrations/20261123090000_allow_secretary_scoped_student_reads.sql",
  "utf8",
);

assert.match(secretaryRole, /'secretary'/);
for (const permission of ["institution.read", "students.read", "students.manage"]) {
  assert.ok(secretaryRole.includes(`'${permission}'`), `Missing Secretary permission: ${permission}`);
}
assert.match(
  studentScope,
  /r\.key in \('institution_admin',\s*'administrative',\s*'director'\)/,
  "Baseline student scope helper changed; review the additive migration",
);
assert.match(fix, /private\.can_access_student\(uuid,uuid,text\)/);
assert.match(fix, /'institution_admin', 'administrative', 'director', 'secretary'/);
assert.match(fix, /Expected student-role authorization clause was not found/);

console.log("Secretary student-scope migration checks passed.");
