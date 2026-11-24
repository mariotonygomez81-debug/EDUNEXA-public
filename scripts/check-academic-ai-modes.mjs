import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/route.ts", "utf8");
const client = readFileSync("src/app/dashboard/[slug]/teaching/reports/academic/student-report.tsx", "utf8");
const demo = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/test/route.ts", "utf8");
const env = readFileSync(".env.example", "utf8");
const docs = readFileSync("docs/operations/academic-ai-groq.md", "utf8");

assert.match(api, /GROQ_API_KEY/);
assert.match(api, /GROQ_ALLOW_STUDENT_DATA !== "true"/);
assert.match(api, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
assert.match(api, /engine: "groq"/);
assert.match(api, /studentReference: "el alumno"/);
assert.match(api, /referite a la persona exclusivamente como "el alumno"/);
assert.match(api, /redactToken\(analysis, studentName, "el alumno"\)/);
assert.match(api, /Cache-Control": "no-store, max-age=0"/);
assert.doesNotMatch(api, /Ollama|qwen2\.5|127\.0\.0\.1|body\.mode|mode === "local"/);
assert.equal((api.match(/fetch\(/g) ?? []).length, 1, "Academic reports must use exactly one provider request");

assert.match(client, /Generar informe IA/);
assert.doesNotMatch(client, /Groq|Probar.*datos ficticios|testGroq/);

assert.match(client, /const reportName = "El alumno"/);
assert.match(client, /Informe académico del alumno/);
assert.match(client, /engine\?: "groq"/);
assert.doesNotMatch(client, /Ollama|qwen2\.5|127\.0\.0\.1|IA local|respaldo local|testLocal|generateLocalOnly/);

assert.match(demo, /Synthetic-only endpoint/);
assert.match(demo, /studentReference: "el alumno"/);
assert.match(demo, /referite a la persona exclusivamente como "el alumno"/);
assert.match(demo, /engine: "groq"/);
assert.match(demo, /GROQ_API_KEY/);
assert.doesNotMatch(demo, /GROQ_ALLOW_STUDENT_DATA/);
assert.doesNotMatch(demo, /from\("(students|grade_records|attendance_records|student_period_observations)"\)/);
assert.match(demo, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
assert.equal((demo.match(/fetch\(/g) ?? []).length, 1, "Synthetic demo must call Groq directly without a fallback provider");

assert.match(env, /GROQ_ALLOW_STUDENT_DATA=false/);
assert.match(docs, /exclusivamente Groq/i);
assert.match(docs, /no utiliza otro motor/i);

console.log("Academic AI Groq-only checks passed (single provider, guarded real data, synthetic-only demo, and no-cache).");
