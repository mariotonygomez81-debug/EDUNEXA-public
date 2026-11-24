import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/demo/tutor/page.tsx", "utf8");
const component = readFileSync("src/app/demo/tutor/tutor-demo.tsx", "utf8");

assert.match(route, /process\.env\.NODE_ENV\s*!==\s*["']development["']/,
  "Tutor demo route must be restricted to development.");
assert.match(route, /notFound\(\)/,
  "Tutor demo route must return not-found outside development.");
assert.match(route, /force-dynamic/,
  "Tutor demo route must be evaluated at request time.");

assert.match(component, /const students\s*=\s*\[/,
  "Tutor demo must use its local fictional student fixtures.");
assert.match(component, /const notifications\s*=\s*\[/,
  "Tutor demo must use its local fictional notification fixtures.");
assert.doesNotMatch(component, /(?:from\s+["'][^"']*(?:supabase|groq)|import\s*\(\s*["'][^"']*(?:supabase|groq)|createClient\s*\(|process\.env|fetch\s*\()/i,
  "Tutor demo must not connect to Supabase, Groq, environment secrets or external APIs.");

console.log("Tutor local demo isolation checks passed.");
