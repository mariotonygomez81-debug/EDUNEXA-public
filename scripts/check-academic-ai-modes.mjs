import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/route.ts", "utf8");
const client = readFileSync("src/app/dashboard/[slug]/teaching/reports/academic/student-report.tsx", "utf8");
const demo = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/test/route.ts", "utf8");
const env = readFileSync(".env.example", "utf8");
const docs = readFileSync("docs/operations/academic-ai-groq.md", "utf8");

assert.match(api, /GROQ_API_KEY/);
assert.match(api, /GROQ_ALLOW_STUDENT_DATA !== "true"/);
assert.match(api, /engine: "groq"/);
assert.match(api, /Cache-Control": "no-store, max-age=0"/);
assert.doesNotMatch(api, /body\.mode|Ollama|qwen2\.5|127\.0\.0\.1/, "The academic API must not expose a local AI mode");
assert.doesNotMatch(client, /Ollama|qwen2\.5|127\.0\.0\.1|IA local|respaldo local|testLocal|generateLocalOnly/, "The academic UI must use Groq only");
assert.match(client, /Generar con Groq/);
assert.match(client, /Probar Groq con datos ficticios/);
assert.match(client, /Groq no está disponible/);
assert.match(demo, /Synthetic-only endpoint/);
assert.match(demo, /ESTUDIANTE FICTICIO DE DEMOSTRACIÓN/);
assert.match(env, /GROQ_ALLOW_STUDENT_DATA=false/);
assert.match(docs, /exclusivamente Groq/i);
assert.match(docs, /no se utiliza un motor alternativo/i);

console.log("Academic AI checks passed (Groq-only, server-side key gate, synthetic demo, and no-cache).");
