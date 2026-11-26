import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const institutionOne = "10000000-0000-4000-8000-000000000001";
const institutionTwo = "10000000-0000-4000-8000-000000000002";
const targetUserId = process.env.E2E_TARGET_USER_ID;
const password = process.env.E2E_SYNTHETIC_PASSWORD;

async function api(page, path, method = "GET", body = null, extraHeaders = {}) {
  return page.evaluate(async ({ path, method, body, extraHeaders }) => {
    const headers = new Headers(extraHeaders);
    if (body !== null) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  }, { path, method, body, extraHeaders });
}

async function signIn(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect.poll(async () => (await api(page, "/api/platform/superadmins")).status, {
    timeout: 30_000,
  }).toBe(200);
  return { context, page };
}

function expectStatus(result, status, label) {
  expect(result.status, `${label}: ${JSON.stringify(result.payload)}`).toBe(status);
}

test("Auditoría: filtro institucional y paginación por cursor before", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;

  const all = await api(page, "/api/platform/audit?limit=100");
  expectStatus(all, 200, "global audit listing");
  expect(all.payload.events.length).toBeGreaterThan(2);

  const scoped = await api(page, `/api/platform/audit?limit=100&institutionId=${institutionOne}`);
  expectStatus(scoped, 200, "institution-filtered audit listing");
  expect(scoped.payload.events.length).toBeGreaterThan(0);
  expect(scoped.payload.events.every(event => event.institution_id === institutionOne)).toBe(true);

  const firstPage = await api(page, "/api/platform/audit?limit=3");
  expectStatus(firstPage, 200, "first audit page");
  expect(firstPage.payload.events).toHaveLength(3);
  const cursor = firstPage.payload.events[2].occurred_at;
  const secondPage = await api(page, `/api/platform/audit?limit=3&before=${encodeURIComponent(cursor)}`);
  expectStatus(secondPage, 200, "second audit page");
  expect(secondPage.payload.events.length).toBeGreaterThan(0);
  expect(secondPage.payload.events.every(event => new Date(event.occurred_at) < new Date(cursor))).toBe(true);

  await operator.context.close();
});

test("Auditoría: búsqueda textual y detalle individual no están implementados en el contrato actual", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;

  await page.goto("/dashboard/platform");
  const audit = page.locator("#global-audit");
  await expect(audit).toBeVisible();
  await expect(audit.getByText("Auditoría global", { exact: true })).toBeVisible();

  const unsupportedSearch = await api(page, "/api/platform/audit?limit=100&search=__edunexa_no_match__");
  expectStatus(unsupportedSearch, 200, "audit endpoint currently ignores unsupported search parameter");
  expect(unsupportedSearch.payload.events.some(event =>
    !JSON.stringify(event).includes("__edunexa_no_match__")
  )).toBe(true);

  const listed = await api(page, "/api/platform/audit?limit=10");
  expectStatus(listed, 200, "audit listing for detail lookup");
  const eventId = listed.payload.events[0]?.id;
  expect(eventId).toBeTruthy();
  const detail = await api(page, `/api/platform/audit/${eventId}`);
  expectStatus(detail, 404, "individual audit detail route is not implemented");

  await operator.context.close();
});

test("Administradores: asignación y revocación son idempotentes; membresías manipuladas se rechazan", async ({ browser }) => {
  expect(targetUserId).toBeTruthy();
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;
  const key = `admin-assign-${randomUUID()}`;
  const assignmentBody = {
    userId: targetUserId,
    reason: "Asignación sintética para comprobar reintentos idempotentes",
  };
  const assignmentPath = `/api/platform/institutions/${institutionOne}/administrators`;
  const first = await api(page, assignmentPath, "POST", assignmentBody, { "Idempotency-Key": key });
  expectStatus(first, 201, "initial administrator assignment");
  const replay = await api(page, assignmentPath, "POST", assignmentBody, { "Idempotency-Key": key });
  expectStatus(replay, 201, "same-key assignment replay");
  expect(replay.payload.administrator.membership_id).toBe(first.payload.administrator.membership_id);

  const changedPayload = await api(page, assignmentPath, "POST", {
    ...assignmentBody,
    reason: "Reutilización de clave con contenido distinto",
  }, { "Idempotency-Key": key });
  expectStatus(changedPayload, 409, "same idempotency key with a different request body");

  const membershipId = first.payload.administrator.membership_id;
  const wrongTenant = await api(
    page,
    `/api/platform/institutions/${institutionTwo}/administrators/${membershipId}`,
    "DELETE",
    { reason: "Intento manipulado de revocación entre instituciones" },
    { "Idempotency-Key": `wrong-tenant-${randomUUID()}` },
  );
  expectStatus(wrongTenant, 404, "membership identifier cannot be moved to another institution");

  const revokePath = `/api/platform/institutions/${institutionOne}/administrators/${membershipId}`;
  const revokeKey = `admin-revoke-${randomUUID()}`;
  const revokeBody = { reason: "Revocación sintética para validar reintento idempotente" };
  const revoked = await api(page, revokePath, "DELETE", revokeBody, { "Idempotency-Key": revokeKey });
  expectStatus(revoked, 200, "initial administrator revocation");
  expect(revoked.payload.administrator.status).toBe("inactive");
  const revokeReplay = await api(page, revokePath, "DELETE", revokeBody, { "Idempotency-Key": revokeKey });
  expectStatus(revokeReplay, 200, "same-key revocation replay");
  expect(revokeReplay.payload.administrator.membership_id).toBe(membershipId);

  await operator.context.close();
});

test("Instituciones: solicitudes concurrentes con la misma clave crean un único registro", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;
  const suffix = randomUUID().slice(0, 10);
  const key = `institution-concurrent-${randomUUID()}`;
  const body = {
    displayName: `Concurrencia E2E ${suffix}`,
    legalName: `Concurrencia E2E ${suffix} S.A.`,
    slug: `concurrencia-e2e-${suffix}`,
    reason: "Prueba sintética de concurrencia e idempotencia",
  };
  const path = "/api/platform/institutions";
  const [first, second] = await Promise.all([
    api(page, path, "POST", body, { "Idempotency-Key": key }),
    api(page, path, "POST", body, { "Idempotency-Key": key }),
  ]);
  expectStatus(first, 201, "first concurrent institution request");
  expectStatus(second, 201, "second concurrent institution request");
  expect(first.payload.institution.id).toBe(second.payload.institution.id);

  const differentBody = await api(page, path, "POST", {
    ...body,
    displayName: `Contenido distinto ${suffix}`,
  }, { "Idempotency-Key": key });
  expectStatus(differentBody, 409, "concurrent request key cannot be reused for another payload");

  await operator.context.close();
});

test("Administradores: PATCH de edición/suspensión no existe y una sesión cerrada pierde acceso", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page, context } = operator;
  const roster = await api(page, `/api/platform/institutions/${institutionOne}/administrators`);
  expectStatus(roster, 200, "institution administrator roster");
  const membershipId = roster.payload.administrators[0]?.membership_id;
  expect(membershipId).toBeTruthy();

  const unsupportedEdit = await api(
    page,
    `/api/platform/institutions/${institutionOne}/administrators/${membershipId}`,
    "PATCH",
    { displayName: "Nombre editado", reason: "Edición sintética no disponible" },
    { "Idempotency-Key": `admin-edit-${randomUUID()}` },
  );
  expectStatus(unsupportedEdit, 404, "administrator edit route is not implemented");

  const unsupportedSuspend = await api(
    page,
    `/api/platform/institutions/${institutionOne}/administrators/${membershipId}/status`,
    "PATCH",
    { status: "suspended", reason: "Suspensión sintética no disponible" },
    { "Idempotency-Key": `admin-suspend-${randomUUID()}` },
  );
  expectStatus(unsupportedSuspend, 404, "administrator suspension route is not implemented");

  await page.goto("/dashboard/platform");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expectStatus(await api(page, "/api/platform/superadmins"), 401, "signed-out browser session cannot access platform APIs");

  await context.close();
});

test("Rutas globales: identificadores manipulados y actor ordinario reciben denegación", async ({ browser }) => {
  const ordinary = await browser.newContext();
  const page = await ordinary.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(process.env.E2E_TARGET_EMAIL);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect.poll(async () => (await api(page, "/api/platform/superadmins")).status, { timeout: 30_000 }).toBe(403);

  expectStatus(await api(page, "/api/platform/institutions/not-a-uuid/administrators"), 404,
    "malformed institution resource is not resolved");
  expectStatus(await api(page, `/api/platform/institutions/${institutionOne}/administrators/not-a-uuid`, "DELETE", {
    reason: "Intento con identificador de membresía manipulado",
  }, { "Idempotency-Key": `malformed-membership-${randomUUID()}` }), 403,
  "ordinary identity is denied before any mutation");
  await ordinary.close();
});
