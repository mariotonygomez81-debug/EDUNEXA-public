import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const institutionOne = "10000000-0000-4000-8000-000000000001";
const institutionTwo = "10000000-0000-4000-8000-000000000002";
const targetUserId = process.env.E2E_TARGET_USER_ID;
const password = process.env.E2E_SYNTHETIC_PASSWORD;

async function api(page, path, method = "GET", body = null) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === null ? {} : { "Content-Type": "application/json" },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      payload: await response.json().catch(() => ({})),
    };
  }, { path, method, body });
}

async function signIn(browser, email, expectedStatus = 200) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect.poll(async () => (await api(page, "/api/platform/superadmins")).status, {
    message: `Auth identity ${email} must be checked by the real platform API`,
    timeout: 30_000,
  }).toBe(expectedStatus);
  return { context, page };
}

function assertStatus(result, status, label) {
  expect(result.status, `${label}: ${JSON.stringify(result.payload)}`).toBe(status);
}

test("Instituciones: alta, edición y ciclo de suspensión/reactivación desde el navegador", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;
  await page.goto("/dashboard/platform/institutions");
  await expect(page.getByRole("heading", { name: "ABM de plataformas" })).toBeVisible();
  await expect(page.locator("#institution-lifecycle")).toBeVisible();

  const suffix = randomUUID().slice(0, 8);
  const displayName = `Institución UI E2E ${suffix}`;
  const updatedName = `Institución UI E2E Editada ${suffix}`;
  const slug = `edunexa-ui-e2e-${suffix}`;

  await page.getByLabel("Nombre institucional").fill(displayName);
  await page.getByLabel("Razón social").fill(`Razón social UI E2E ${suffix}`);
  await page.getByLabel("Identificador").fill(slug);
  await page.getByLabel("Motivo del alta").fill("Alta sintética para validar la pantalla de instituciones");
  await page.getByRole("button", { name: "Registrar institución" }).click();
  await expect(page.getByRole("status")).toContainText("Solicitud de alta registrada");
  const createdCard = page.getByText(slug, { exact: true }).locator("xpath=../../..");
  await expect(createdCard).toContainText(displayName);
  await expect(createdCard).toContainText("Pendiente");

  await createdCard.getByRole("button", { name: "Editar ficha" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar ficha del colegio" });
  await dialog.getByLabel("Nombre institucional").fill(updatedName);
  await dialog.getByLabel("Razón social").fill(`Razón social editada ${suffix}`);
  await dialog.getByLabel("Motivo del cambio (obligatorio)").fill("Edición sintética para comprobar persistencia de la ficha");
  await dialog.getByRole("button", { name: "Guardar ficha completa" }).click();
  await expect(page.getByRole("status")).toContainText("Ficha institucional actualizada correctamente");
  await expect(page.getByText(updatedName, { exact: true })).toBeVisible();

  const secondInstitution = page.getByText("Institución E2E Dos", { exact: true }).locator("xpath=../../..");
  page.once("dialog", dialogEvent => dialogEvent.accept("Suspensión sintética para prueba de interfaz"));
  await secondInstitution.getByRole("button", { name: "Suspender" }).click();
  await expect(secondInstitution).toContainText("Suspendida");
  page.once("dialog", dialogEvent => dialogEvent.accept("Reactivación sintética para prueba de interfaz"));
  await secondInstitution.getByRole("button", { name: "Activar" }).click();
  await expect(secondInstitution).toContainText("Activa");

  await operator.context.close();
});

test("Administradores: invitación, aprobación por tenant y separación de padrones", async ({ browser }) => {
  const a = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const b = await signIn(browser, process.env.E2E_SUPERADMIN_B_EMAIL);
  await a.page.goto("/dashboard/platform/administrators");
  await expect(a.page.getByRole("heading", { name: "Administradores de colegios" })).toBeVisible();
  const institutionPicker = a.page.getByLabel("Institución");
  await institutionPicker.selectOption(institutionOne);
  await expect(a.page.getByText("superadmin-a@edunexa.test")).toBeVisible();

  await institutionPicker.selectOption(institutionTwo);
  await expect(a.page.getByText("No hay administradores asignados a esta institución.")).toBeVisible();
  await expect(a.page.getByText("superadmin-a@edunexa.test")).toHaveCount(0);

  await institutionPicker.selectOption(institutionOne);
  const emailOne = `ui-admin-one-${randomUUID().slice(0, 8)}@edunexa.test`;
  await a.page.getByLabel("Correo del nuevo administrador").fill(emailOne);
  await a.page.getByLabel("Nombre del administrador").fill("UI Synthetic");
  await a.page.getByLabel("Apellido del administrador").fill("TenantOne");
  await a.page.getByLabel("Motivo de la invitación").fill("Invitación UI sintética para institución uno");
  await a.page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(a.page.getByRole("status")).toContainText("Invitación enviada");
  await expect(a.page.getByText(new RegExp(`${emailOne} · Pendiente de aprobación`))).toBeVisible();

  const rosterOne = await api(a.page, `/api/platform/institutions/${institutionOne}/administrators`);
  assertStatus(rosterOne, 200, "institution one roster");
  const invitationOne = rosterOne.payload.administrators.find(item => item.email === emailOne);
  expect(invitationOne?.membership_id).toBeTruthy();

  const deniedApproval = await api(
    b.page,
    `/api/institution/administrator-invitations/${invitationOne.membership_id}/approve`,
    "POST",
    { institutionId: institutionOne },
  );
  assertStatus(deniedApproval, 403, "global Superadmin without institution membership cannot approve institution one");

  const approved = await api(
    a.page,
    `/api/institution/administrator-invitations/${invitationOne.membership_id}/approve`,
    "POST",
    { institutionId: institutionOne },
  );
  assertStatus(approved, 200, "same-tenant active administrator approves institution one invitation");
  await a.page.reload();
  await institutionPicker.selectOption(institutionOne);
  await expect(a.page.getByText(new RegExp(`${emailOne} · Activo`))).toBeVisible();

  await institutionPicker.selectOption(institutionTwo);
  const emailTwo = `ui-admin-two-${randomUUID().slice(0, 8)}@edunexa.test`;
  await a.page.getByLabel("Correo del nuevo administrador").fill(emailTwo);
  await a.page.getByLabel("Nombre del administrador").fill("UI Synthetic");
  await a.page.getByLabel("Apellido del administrador").fill("TenantTwo");
  await a.page.getByLabel("Motivo de la invitación").fill("Invitación UI sintética para institución dos");
  await a.page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(a.page.getByRole("status")).toContainText("Invitación enviada");
  const rosterTwo = await api(a.page, `/api/platform/institutions/${institutionTwo}/administrators`);
  assertStatus(rosterTwo, 200, "institution two roster");
  const invitationTwo = rosterTwo.payload.administrators.find(item => item.email === emailTwo);
  expect(invitationTwo?.membership_id).toBeTruthy();

  const crossTenantApproval = await api(
    a.page,
    `/api/institution/administrator-invitations/${invitationTwo.membership_id}/approve`,
    "POST",
    { institutionId: institutionTwo },
  );
  assertStatus(crossTenantApproval, 403, "institution one administrator cannot approve institution two invitation");

  await b.context.close();
  await a.context.close();
});

test("Auditoría: navegación a la bitácora y visualización de un evento recién generado", async ({ browser }) => {
  expect(targetUserId, "local Auth fixture must export the synthetic target UUID").toBeTruthy();
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;
  await page.goto("/dashboard/platform");
  await expect(page.locator("#superadmin-governance")).toBeVisible();
  await page.getByLabel("UUID de usuario existente").fill(targetUserId);
  await page.getByLabel("Acción solicitada").selectOption("grant");
  await page.getByLabel("Motivo (mínimo 12 caracteres)").fill("Solicitud UI para comprobar evento de auditoría");
  await page.getByRole("button", { name: "Solicitar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Operación registrada");
  await page.getByRole("link", { name: /Auditoría global/ }).click();
  const audit = page.locator("#global-audit");
  await expect(audit).toBeVisible();
  await expect(audit.getByText("platform.superadmin.change.request", { exact: true })).toBeVisible();
  await expect(audit).toContainText("Solicitud UI para comprobar evento de auditoría");
  await operator.context.close();
});

test("Revocación global: una sesión de navegador ya autenticada pierde acceso inmediatamente", async ({ browser }) => {
  expect(targetUserId, "local Auth fixture must export the synthetic target UUID").toBeTruthy();
  const a = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const b = await signIn(browser, process.env.E2E_SUPERADMIN_B_EMAIL);

  const grant = await api(a.page, "/api/platform/superadmins/requests", "POST", {
    targetUserId, action: "grant",
    reason: "Alta sintética para probar revocación de sesión existente",
  });
  assertStatus(grant, 201, "create grant request");
  const grantId = grant.payload.requestId;
  assertStatus(await api(a.page, `/api/platform/superadmins/requests/${grantId}/approve`, "POST", {}), 403, "requester cannot self-approve");
  assertStatus(await api(b.page, `/api/platform/superadmins/requests/${grantId}/approve`, "POST", {}), 200, "independent approval");
  const grantExecution = await api(a.page, `/api/platform/superadmins/requests/${grantId}/execute`, "POST", {});
  assertStatus(grantExecution, 200, "execute grant");
  expect(grantExecution.payload.result?.status).toBe("completed");

  const target = await signIn(browser, process.env.E2E_TARGET_EMAIL);
  assertStatus(await api(target.page, "/api/platform/superadmins"), 200, "target receives global access after grant");

  const revoke = await api(b.page, "/api/platform/superadmins/requests", "POST", {
    targetUserId, action: "revoke",
    reason: "Revocación sintética para invalidar sesión ya autenticada",
  });
  assertStatus(revoke, 201, "create revoke request");
  const revokeId = revoke.payload.requestId;
  assertStatus(await api(b.page, `/api/platform/superadmins/requests/${revokeId}/approve`, "POST", {}), 403, "requester cannot self-approve revocation");
  assertStatus(await api(a.page, `/api/platform/superadmins/requests/${revokeId}/approve`, "POST", {}), 200, "independent revocation approval");
  const revokeExecution = await api(b.page, `/api/platform/superadmins/requests/${revokeId}/execute`, "POST", {});
  assertStatus(revokeExecution, 200, "execute revocation");
  expect(revokeExecution.payload.result?.status).toBe("completed");

  const sameSessionAfterRevoke = await api(target.page, "/api/platform/superadmins");
  assertStatus(sameSessionAfterRevoke, 403, "already-authenticated target session is denied after server-side role revocation");

  await target.context.close();
  await b.context.close();
  await a.context.close();
});
