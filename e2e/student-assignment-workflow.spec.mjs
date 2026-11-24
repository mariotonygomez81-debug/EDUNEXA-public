import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

const required = [
  "E2E_INSTITUTION_SLUG",
  "E2E_CLASSROOM_ID",
  "E2E_ASSIGNMENT_TITLE",
  "E2E_STUDENT_EMAIL",
  "E2E_STUDENT_PASSWORD",
  "E2E_TEACHER_EMAIL",
  "E2E_TEACHER_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required E2E environment variable: ${key}`);
}

const slug = process.env.E2E_INSTITUTION_SLUG;
const classroomId = process.env.E2E_CLASSROOM_ID;
const assignmentTitle = process.env.E2E_ASSIGNMENT_TITLE;
const classroomUrl = `/dashboard/${encodeURIComponent(slug)}/classroom/${classroomId}?section=work`;

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/, { timeout: 30_000 });
  await page.goto(classroomUrl);
  await expect(page.getByRole("heading", { name: assignmentTitle, exact: true })).toBeVisible();
}

function assignmentCard(page) {
  return page.locator("article").filter({
    has: page.getByRole("heading", { name: assignmentTitle, exact: true }),
  }).first();
}

test("student private draft, cross-tab conflict, PDF submission, teacher download and grading", async ({ browser }) => {
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
  const studentCard = assignmentCard(studentPage);
  const editor = studentCard.getByRole("textbox", { name: "Contenido de la tarea" });
  await expect(editor).toBeVisible();

  const templates = [
    ["practical", "Trabajo práctico"], ["report", "Informe"],
    ["monograph", "Monografía"], ["project", "Proyecto"],
  ];
  for (let index = 0; index < templates.length; index += 1) {
    if (index > 0) studentPage.once("dialog", (dialog) => dialog.accept());
    await studentCard.getByLabel("Plantillas de documento").selectOption(templates[index][0]);
    await expect(editor).toContainText(templates[index][1]);
  }
  await editor.fill("BORRADOR PRIVADO EDUNEXA - primera versión. Desarrollo y conclusión. " + "Contenido de prueba para validar saltos y numeración de páginas. ".repeat(220));
  await studentCard.getByLabel("Encabezado PDF").fill("EDUNEXA · E2E · Encabezado");
  await studentCard.getByLabel("Pie de página").fill("Documento de prueba · Pie");
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64");
  await studentCard.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles({
    name: "e2e-pixel.png", mimeType: "image/png", buffer: tinyPng,
  });
  await expect(editor.locator("img")).toHaveCount(1);
  await expect(studentCard.getByText(/Borrador privado sincronizado/)).toContainText("versión 1", { timeout: 30_000 });

  // A second tab starts from the same server revision, then deliberately saves stale content.
  const secondTab = await studentContext.newPage();
  await secondTab.goto(classroomUrl);
  const secondCard = assignmentCard(secondTab);
  const secondEditor = secondCard.getByRole("textbox", { name: "Contenido de la tarea" });
  await expect(secondEditor).toContainText("BORRADOR PRIVADO EDUNEXA", { timeout: 30_000 });
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.type("Versión de primera pestaña.");
  await expect(studentCard.getByText(/Borrador privado sincronizado/)).toContainText("versión 2", { timeout: 30_000 });
  await secondEditor.click();
  await secondEditor.press("Control+End");
  await secondEditor.press("Enter");
  await secondEditor.type("Versión elegida desde segunda pestaña.");
  await expect(secondCard.getByRole("alert")).toContainText("otra versión guardada", { timeout: 30_000 });
  await secondCard.getByRole("button", { name: "Conservar mi versión" }).click();
  await expect(secondCard.getByText(/Borrador privado sincronizado/)).toContainText("versión 3", { timeout: 30_000 });
  await secondTab.close();

  await studentPage.reload();
  const restoredCard = assignmentCard(studentPage);
  const restoredEditor = restoredCard.getByRole("textbox", { name: "Contenido de la tarea" });
  await expect(restoredEditor).toContainText("versión elegida desde segunda pestaña", { timeout: 30_000 });
  await expect(restoredEditor.locator("img")).toHaveCount(1);
  await expect(restoredCard.getByLabel("Encabezado PDF")).toHaveValue("EDUNEXA · E2E · Encabezado");
  await expect(restoredCard.getByLabel("Pie de página")).toHaveValue("Documento de prueba · Pie");

  // The teacher must not see a student's unsubmitted private draft.
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  await signIn(teacherPage, process.env.E2E_TEACHER_EMAIL, process.env.E2E_TEACHER_PASSWORD);
  const teacherCardBeforeSubmit = assignmentCard(teacherPage);
  await expect(teacherCardBeforeSubmit.getByText("Aún no hay trabajo para revisar")).toBeVisible();
  await expect(teacherCardBeforeSubmit.getByText(/versión elegida desde segunda pestaña/i)).toHaveCount(0);

  await restoredCard.getByRole("button", { name: "Vista previa PDF" }).click();
  const preview = studentPage.getByRole("dialog", { name: "Vista previa PDF" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("iframe")).toBeVisible();
  const [download] = await Promise.all([
    studentPage.waitForEvent("download"),
    preview.getByRole("button", { name: "Descargar PDF" }).click(),
  ]);
  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  await preview.getByRole("button", { name: "Cerrar vista previa" }).click();

  await restoredCard.getByRole("button", { name: /Entregar tarea en PDF|Actualizar entrega y PDF/ }).click();
  await expect(restoredCard.getByText("¡Tarea entregada! El documento PDF quedó adjunto para tu docente.")).toBeVisible({ timeout: 60_000 });
  await teacherPage.reload();

  const teacherCard = assignmentCard(teacherPage);
  await expect(teacherCard.getByText("Seguimiento y corrección")).toBeVisible();
  await teacherCard.getByText("Ver trabajo, calificar y devolver").click();
  const fileLink = teacherCard.getByRole("link", { name: /Descargar Tarea-/ });
  await expect(fileLink).toBeVisible();
  await expect(fileLink).toHaveAttribute("href", /^https:\/\//);
  await teacherCard.getByLabel("Nota (%)").fill("95");
  await teacherCard.getByLabel("Devolución para el estudiante").fill("Excelente trabajo. Revisá la bibliografía.");
  await teacherCard.getByRole("button", { name: "Guardar calificación y devolución" }).click();
  await expect(teacherCard.getByText(/Calificación y devolución guardadas/)).toBeVisible({ timeout: 30_000 });

  await studentPage.reload();
  await expect(assignmentCard(studentPage).getByText(/Calificación: 95/)).toBeVisible({ timeout: 30_000 });
  await teacherContext.close();
  await studentContext.close();
});
