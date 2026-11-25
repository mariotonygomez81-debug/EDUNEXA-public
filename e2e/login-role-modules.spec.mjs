import { test, expect } from "@playwright/test";

const slug = process.env.E2E_INSTITUTION_SLUG;
const required = [
  "E2E_BASE_URL", "E2E_INSTITUTION_SLUG",
  "E2E_TEACHER_EMAIL", "E2E_TEACHER_PASSWORD",
  "E2E_STUDENT_EMAIL", "E2E_STUDENT_PASSWORD",
  "E2E_TUTOR_EMAIL", "E2E_TUTOR_PASSWORD",
  "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD",
  "E2E_DIRECTOR_EMAIL", "E2E_DIRECTOR_PASSWORD",
  "E2E_ADMINISTRATIVE_EMAIL", "E2E_ADMINISTRATIVE_PASSWORD",
  "E2E_PREFECT_EMAIL", "E2E_PREFECT_PASSWORD",
  "E2E_SECRETARIA_EMAIL", "E2E_SECRETARIA_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing synthetic login E2E setting: ${key}`);
}

async function login(page, email, password) {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/, { timeout: 30_000 });
  await page.goto(`/dashboard/${encodeURIComponent(slug)}`);
}

test("single login opens the integrated teacher workspace", async ({ page }) => {
  await login(page, process.env.E2E_TEACHER_EMAIL, process.env.E2E_TEACHER_PASSWORD);
  await expect(page.getByRole("heading", { name: "Explorá tus módulos" })).toBeVisible();
  await expect(page.getByText("Docente", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aula virtual/ }).first()).toBeVisible();
});

test("single login opens the student's own learning module", async ({ page }) => {
  await login(page, process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/student`);
  await expect(page.getByRole("heading", { name: "Mis aulas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "¿Qué necesitás hacer?" })).toBeVisible();
});

test("single login opens the linked-family tutor portal", async ({ page }) => {
  await login(page, process.env.E2E_TUTOR_EMAIL, process.env.E2E_TUTOR_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/portal`);
  await expect(page.getByRole("heading", { name: "Mi espacio educativo" })).toBeVisible();
  await expect(page.getByText("PORTAL DEL ESTUDIANTE Y LA FAMILIA")).toBeVisible();
  await expect(page.getByText("Todavía no hay estudiantes vinculados")).toHaveCount(0);
});

test("institution administrator opens the control center", async ({ page }) => {
  await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/admin-center`);
  await expect(page.getByRole("heading", { name: "Centro de control institucional" })).toBeVisible();
});

test("director opens the institutional leadership panel", async ({ page }) => {
  await login(page, process.env.E2E_DIRECTOR_EMAIL, process.env.E2E_DIRECTOR_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/direction`);
  await expect(page.getByRole("heading", { name: "Panel directivo" })).toBeVisible();
});

test("administrative profile opens the administrative workspace", async ({ page }) => {
  await login(page, process.env.E2E_ADMINISTRATIVE_EMAIL, process.env.E2E_ADMINISTRATIVE_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/administrative-office`);
  await expect(page.getByRole("heading", { name: "Panel administrativo" })).toBeVisible();
});

test("prefect profile opens the independent attendance workspace", async ({ page }) => {
  await login(page, process.env.E2E_PREFECT_EMAIL, process.env.E2E_PREFECT_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/prefect`);
  await expect(page.getByRole("heading", { name: "Mis divisiones" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Asistencia independiente/ })).toBeVisible();
});

test("secretary subprofile uses the unified director role", async ({ page }) => {
  await login(page, process.env.E2E_SECRETARIA_EMAIL, process.env.E2E_SECRETARIA_PASSWORD);
  await page.goto(`/dashboard/${encodeURIComponent(slug)}/direction`);
  await expect(page.getByRole("heading", { name: "Panel directivo" })).toBeVisible();
  await expect(page.getByText(/Secretaría · Indicadores/)).toBeVisible();
});
