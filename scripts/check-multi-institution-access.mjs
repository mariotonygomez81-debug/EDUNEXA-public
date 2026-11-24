import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");
const workspace = readFileSync("src/app/dashboard/[slug]/page.tsx", "utf8");
const architecture = readFileSync("docs/architecture/integracion-plataforma-unica.md", "utf8");

assert.match(dashboard, /supabase\.from\("memberships"\)[\s\S]*?\.eq\("user_id", user\.id\)[\s\S]*?\.eq\("status", "active"\)/,
  "The dashboard must resolve the authenticated user's active membership.");
assert.match(dashboard, /activeMemberships\.length === 1[\s\S]*?redirect\(/,
  "Exactly one active membership must continue directly to its school workspace.");
assert.match(dashboard, /activeMemberships\.length > 1/,
  "Unexpected multiple active memberships must be handled explicitly.");
assert.doesNotMatch(dashboard, /availableInstitutions\.map|Seleccioná tu institución|href=\{\`\/dashboard\/\$\{institution\.slug\}/,
  "The single-school dashboard must not render an institution selector.");
assert.match(dashboard, /hasNoMembership[\s\S]*?administrador/,
  "Accounts without an active membership must receive a safe access explanation.");
assert.match(workspace, /\.eq\("institution_id", institution\.id\)[\s\S]*?\.eq\("user_id", user\.id\)[\s\S]*?\.eq\("status", "active"\)/,
  "The school workspace must independently verify the authenticated user's active membership.");
assert.match(architecture, /una instalación para un solo colegio/i);
assert.match(architecture, /Expansión futura — fuera del alcance actual/);
assert.doesNotMatch(architecture, /pruebas de aislamiento multiinstitución|selector de instituciones.*actual/i);

console.log("Single-school access checks passed.");
