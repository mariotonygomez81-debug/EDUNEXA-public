import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/route.ts", "utf8");
const client = readFileSync("src/app/dashboard/[slug]/teaching/reports/academic/student-report.tsx", "utf8");
const demo = readFileSync("src/app/api/dashboard/[slug]/teaching/reports/academic/test/route.ts", "utf8");
const env = readFileSync(".env.example", "utf8");
const docs = readFileSync("docs/operations/academic-ai-local-fallback.md", "utf8");

assert.match(api, /body\.mode !== undefined && body\.mode !== "groq" && body\.mode !== "local"/);
assert.match(api, /if \(body\.mode === "local"\)/);
assert.ok(api.indexOf('if (body.mode === "local")') < api.indexOf("if (!process.env.GROQ_API_KEY)"), "Local mode must not depend on the Groq API key");
assert.match(api, /GROQ_ALLOW_STUDENT_DATA !== "true"/);
assert.match(api, /Cache-Control": "no-store, max-age=0"/);
assert.match(api, /engine: "groq"/);
assert.match(client, /async function generateLocalOnly\(\)/);
assert.match(client, /Generar solo con IA local/);
assert.match(client, /Groq \(respaldo local automático\)/);
assert.match(client, /http:\/\/127\.0\.0\.1:11434\/api\/chat/);
assert.match(client, /model: "qwen2\.5:3b"/);
assert.match(client, /OLLAMA_ORIGINS/);
assert.match(demo, /Synthetic-only endpoint/);
assert.match(demo, /ESTUDIANTE FICTICIO DE DEMOSTRACIÓN/);
assert.match(env, /GROQ_ALLOW_STUDENT_DATA=false/);
assert.match(docs, /Solo IA local/);
assert.match(docs, /No usar/);

console.log("Academic AI modes checks passed (Groq gate, local-only, fallback, synthetic demo, and no-cache).");