import { test, expect } from "@playwright/test";

const institution = "synthetic-e2e-institution";

test("single login form exposes accessible credentials and recovery", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#email")).toHaveAttribute("type", "email");
  await expect(page.locator("#email")).toHaveAttribute("required", "");
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await expect(page.locator("#password")).toHaveAttribute("minlength", "8");
  await expect(page.getByRole("button", { name: "Ingresar", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveAttribute("href", "/forgot-password");

  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
});

const protectedWorkspaces = [
  ["Docentes", `/dashboard/${institution}/teaching`],
  ["Preceptor", `/dashboard/${institution}/prefect`],
  ["Alumnos", `/dashboard/${institution}/student`],
  ["Tutor", `/dashboard/${institution}/portal`],
  ["Directivos", `/dashboard/${institution}/direction`],
  ["Administrativos", `/dashboard/${institution}/administrative-office`],
  ["Administrador", `/dashboard/${institution}/admin-center`],
  ["Superadministrador global", "/dashboard/platform"],
];

for (const [role, path] of protectedWorkspaces) {
  test(`${role}: anonymous browser session cannot open its workspace`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
}
