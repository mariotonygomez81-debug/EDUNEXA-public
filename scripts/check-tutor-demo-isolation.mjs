import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/demo/tutor/page.tsx", "utf8");
const dashboardRoute = readFileSync("src/app/demo/dashboard/tutor/page.tsx", "utf8");
const component = readFileSync("src/app/demo/tutor/tutor-demo.tsx", "utf8");

assert.match(route, /process\.env\.NODE_ENV\s*!==\s*["']development["']/,
  "The alternate Tutor demo route must remain restricted to development.");
assert.match(route, /notFound\(\)/,
  "The alternate Tutor demo route must return not-found outside development.");
assert.match(route, /force-dynamic/,
  "The alternate Tutor demo route must be evaluated at request time.");

assert.match(dashboardRoute, /EDUNEXA_TUTOR_PREVIEW_ENABLED\s*===\s*["']true["']/,
  "The hosted Tutor preview must require its dedicated explicit environment flag.");
assert.match(dashboardRoute, /process\.env\.NODE_ENV\s*!==\s*["']development["']\s*&&\s*!previewEnabled/,
  "Only the dashboard Tutor route may open in the explicitly enabled preview environment.");
assert.match(dashboardRoute, /notFound\(\)/,
  "The dashboard Tutor route must remain not-found when preview is disabled.");
assert.match(dashboardRoute, /force-dynamic/,
  "The dashboard Tutor route must be evaluated at request time.");

assert.match(component, /const students\s*=\s*\[/,
  "Tutor demo must use its local fictional student fixtures.");
assert.match(component, /const notifications\s*=\s*\[/,
  "Tutor demo must use its local fictional notification fixtures.");
assert.doesNotMatch(component, /(?:from\s+["'][^"']*(?:supabase|groq)|import\s*\(\s*["'][^"']*(?:supabase|groq)|createClient\s*\(|process\.env|fetch\s*\()/i,
  "Tutor demo must not connect to Supabase, Groq, environment secrets or external APIs.");

console.log("Tutor demo isolation checks passed.");
