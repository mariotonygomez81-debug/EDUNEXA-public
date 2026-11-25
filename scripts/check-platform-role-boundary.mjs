import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const auth = read("../src/lib/auth/platform-admin.ts");
const globalPage = read("../src/app/dashboard/platform/page.tsx");
const dashboard = read("../src/app/dashboard/page.tsx");
const institution = read("../src/app/dashboard/[slug]/page.tsx");

assert.match(auth, /app_metadata\?\.platform_role === "superadmin"/);
assert.ok(!auth.includes("user.user_metadata"));
assert.match(globalPage, /isPlatformSuperAdmin\(user\)/);
assert.match(globalPage, /redirect\("\/login"\)/);
assert.match(dashboard, /redirect\("\/dashboard\/platform"\)/);
assert.match(institution, /roleKeys\.includes\(module\.role\)/);
assert.match(institution, /memberships\.manage/);
for (const name of ["Docentes", "Preceptor", "Alumnos", "Tutor", "Directivos", "Administrativos", "Administrador"]) {
  assert.ok(institution.includes(`name: "${name}"`), `Falta el módulo institucional: ${name}`);
}
assert.ok(globalPage.includes("Centro de Superadministración"), "Falta el octavo módulo global");
console.log("Platform role boundary and eight-module navigation checks passed.");
