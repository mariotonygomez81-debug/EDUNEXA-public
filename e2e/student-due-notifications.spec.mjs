import { test, expect } from "@playwright/test";

const required = [
  "E2E_INSTITUTION_SLUG",
  "E2E_STUDENT_EMAIL",
  "E2E_STUDENT_PASSWORD",
  "E2E_DUE_ASSIGNMENT_TITLE",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required E2E environment variable: ${key}`);
}

const slug = process.env.E2E_INSTITUTION_SLUG;
const assignmentTitle = process.env.E2E_DUE_ASSIGNMENT_TITLE;
const studentUrl = `/dashboard/${encodeURIComponent(slug)}/student`;
const notificationsUrl = `/dashboard/${encodeURIComponent(slug)}/notifications`;

test("student due-assignment notification, preference, unread badge and read state", async ({ page }) => {
  // The scheduler runs every 15 minutes. Allow one full interval plus a small margin.
  test.setTimeout(20 * 60 * 1000);

  await page.goto("/login");
  await page.locator("#email").fill(process.env.E2E_STUDENT_EMAIL);
  await page.locator("#password").fill(process.env.E2E_STUDENT_PASSWORD);
  await page.getByRole("button", { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/, { timeout: 30_000 });

  await page.goto(studentUrl);
  const notificationBell = page.getByRole("link", { name: /Notificaciones:/ });
  await expect(notificationBell).toBeVisible();

  // Wait for the real staging cron to generate the reminder for the disposable task.
  await page.goto(notificationsUrl);
  await expect(page.getByRole("heading", { name: "Notificaciones" })).toBeVisible();
  const dueNotification = () => page.locator("article")
    .filter({ hasText: assignmentTitle })
    .filter({ hasText: "Tarea por vencer" });

  await expect.poll(async () => {
    await page.reload();
    return dueNotification().count();
  }, {
    timeout: 16 * 60 * 1000,
    intervals: [15_000, 30_000],
    message: "The staging scheduler should create one due-task notification within one 15-minute interval",
  }).toBe(1);

  // Return to the dashboard to validate the actual unread bell badge.
  await page.goto(studentUrl);
  const unreadBell = page.getByRole("link", { name: /Notificaciones: 1 sin leer/ });
  await expect(unreadBell).toBeVisible();
  await unreadBell.click();
  await expect(page.getByRole("heading", { name: "Notificaciones" })).toBeVisible();

  const dueCard = dueNotification();
  await expect(dueCard).toHaveCount(1);
  await expect(dueCard.getByRole("heading", { name: `Tarea próxima a vencer: ${assignmentTitle}`, exact: true })).toBeVisible();
  await expect(dueCard.getByRole("link", { name: "Ver mis tareas" })).toBeVisible();

  const unreadCount = page.getByText("Pendientes de leer").locator("xpath=..").locator("p").nth(1);
  await expect(unreadCount).toHaveText("1");

  const preferenceForm = page.locator("form").filter({
    has: page.locator('input[name="notification_type"][value="assignment_due"]'),
  });
  const preferenceCheckbox = preferenceForm.getByRole("checkbox");
  await expect(preferenceCheckbox).toBeChecked();

  // Verify the preference can be disabled and re-enabled from the student's UI.
  await preferenceCheckbox.uncheck();
  await preferenceForm.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tus preferencias se actualizaron." })).toBeVisible();
  await page.reload();
  await expect(page.locator("form").filter({
    has: page.locator('input[name="notification_type"][value="assignment_due"]'),
  }).getByRole("checkbox")).not.toBeChecked();

  const enabledPreferenceForm = page.locator("form").filter({
    has: page.locator('input[name="notification_type"][value="assignment_due"]'),
  });
  await enabledPreferenceForm.getByRole("checkbox").check();
  await enabledPreferenceForm.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tus preferencias se actualizaron." })).toBeVisible();
  await page.reload();
  await expect(page.locator("form").filter({
    has: page.locator('input[name="notification_type"][value="assignment_due"]'),
  }).getByRole("checkbox")).toBeChecked();

  // Mark the single generated reminder as read and verify the count reaches zero.
  const unreadDueCard = dueNotification();
  await expect(unreadDueCard.getByRole("button", { name: "Marcar como leída" })).toBeVisible();
  await unreadDueCard.getByRole("button", { name: "Marcar como leída" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notificación marcada como leída." })).toBeVisible();
  await expect(dueNotification().getByText("Leída")).toBeVisible();
  await expect(page.getByText("Pendientes de leer").locator("xpath=..").locator("p").nth(1)).toHaveText("0");

  await page.goto(studentUrl);
  await expect(page.getByRole("link", { name: /Notificaciones: 0 sin leer/ })).toBeVisible();
});
