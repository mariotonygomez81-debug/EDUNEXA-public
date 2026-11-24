import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const portal = readFileSync("src/app/dashboard/[slug]/portal/page.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

assert.match(portal, /from\("report_card_snapshots"\)/, "history must read immutable published snapshots");
assert.match(portal, /\.in\("student_id", portalStudentIds\)/, "history must be limited to linked portal students");
assert.match(portal, /latestPublishedCardsByPeriod/, "history must select the latest published version per period");
assert.match(portal, /workflow_version/, "rectified report-card versions must be considered");
assert.match(portal, /grading_scale\?\.id/, "trends must compare matching grading scales");
assert.match(portal, /delta <= -8/, "significant decline must create a support signal");
assert.match(portal, /current\.isPassing === false/, "failing published results must create a support signal");
assert.match(portal, /Evolución histórica y seguimiento/, "student portal must render the academic history");
assert.match(portal, /publication audience|publication_audience|RLS policy filters each immutable snapshot/i, "history must retain the database publication-audience boundary");
assert.doesNotMatch(portal, /\.from\(["']grade_records["']\)/, "history must not query provisional grade records directly");
assert.match(workflow, /Validate published academic history/, "CI must run the academic-history regression check");
console.log("Published academic history checks passed.");
