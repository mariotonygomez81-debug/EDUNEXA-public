import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/route.ts", "utf8");
const client = readFileSync("src/app/dashboard/[slug]/teaching/reports/academic/student-report.tsx", "utf8");
const demo = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/test/route.ts", "utf8");
const env = readFileSync(".env.example", "utf8");

assert.match(api, /GROQ_API_KEY/);
assert.match(api, /GROQ_ALLOW_STUDENT_DATA !== "true"/);
assert.match(api, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
assert.match(api, /Cache-Control": "no-store, max-age=0"/);
assert.match(api, /engine: "groq"/);
assert.doesNotMatch(api, /Ollama|qwen2\.5|mode === "local"/);
assert.doesNotMatch(api, /period: row\.grading_period_id/, "Database UUIDs must not be included in AI facts");
assert.match(api, /safeText\(row\.comment, studentName, student\.student_number\)/);
assert.match(client, /async function generate\(\)/);
assert.match(client, /Generar informe con Groq/);
assert.match(client, /Probar Groq con datos ficticios/);
assert.match(client, /engine\?: "groq"/);
assert.doesNotMatch(client, /Ollama|qwen2\.5|IA local|respaldo local|testLocal|generateLocalOnly/);
assert.match(demo, /Synthetic-only endpoint/);
assert.match(demo, /ESTUDIANTE FICTICIO DE DEMOSTRACIÓN/);
assert.match(demo, /engine: "groq"/);
assert.match(env, /GROQ_ALLOW_STUDENT_DATA=false/);

console.log("Academic AI Groq-only checks passed (provider gate, synthetic demo, minimization, and no-cache).");
