import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const auth = read("../src/lib/auth/platform-admin.ts");
const globalPage = read("../src/app/dashboard/platform/page.tsx");
const dashboard = read("../src/app/dashboard/page.tsx");
const institution = read("../src/app/dashboard/[slug]/page.tsx");

assert.match(auth, /app_metadata\?\.platform_role === "superadmin"/);
assert.doesNotMatch(auth, /user_metadata/);
assert.match(globalPage, /isPlatformSuperAdmin\(user\)/);
assert.match(globalPage, /redirect\("\/login"\)/);
assert.match(dashboard, /redirect\("\/dashboard\/platform"\)/);
assert.match(institution, /roleKeys\.includes\(module\.role\)/);
assert.match(institution, /permissions: \["students\.read", "attendance\.read"\]/, "Preceptor requires both student and attendance read access");
assert.match(institution, /permissions: \["reports\.read", "students\.read", "attendance\.read", "grades\.read"\]/, "Directivos requires the full set used by its route");
assert.match(institution, /permissions: \["institution\.manage"\]/, "Administrador module must match the admin-center guard");
assert.match(institution, /module\.permissions\.every\(\(permission\) => permissions\.has\(permission\)\)/);
const prefect = read("../src/app/dashboard/[slug]/prefect/page.tsx");
const director = read("../src/app/dashboard/[slug]/direction/page.tsx");
const adminCenter = read("../src/app/dashboard/[slug]/admin-center/page.tsx");
assert.match(prefect, /permissions\.has\("students\.read"\)[\s\S]*?permissions\.has\("attendance\.read"\)/);
assert.match(director, /permissions\.has\("reports\.read"\)[\s\S]*?permissions\.has\("students\.read"\)[\s\S]*?permissions\.has\("attendance\.read"\)[\s\S]*?permissions\.has\("grades\.read"\)/);
assert.match(adminCenter, /permissions\.has\("institution\.manage"\)/);
assert.match(adminCenter, /roles\?\.key === "institution_admin"/);
for (const name of ["Docentes", "Preceptor", "Alumnos", "Tutor", "Directivos", "Administrativos", "Administrador"]) {
  assert.ok(institution.includes(`name: "${name}"`), `Falta el módulo institucional: ${name}`);
}
assert.ok(globalPage.includes("Centro de Superadministración"), "Falta el octavo módulo global");
console.log("Platform role boundary and eight-module navigation checks passed.");
