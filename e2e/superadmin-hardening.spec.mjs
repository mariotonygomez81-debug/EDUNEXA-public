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
  const cursorEvent = firstPage.payload.events[2];
  const secondPage = await api(page, `/api/platform/audit?limit=3&before=${encodeURIComponent(cursorEvent.occurred_at)}&beforeId=${cursorEvent.id}`);
  expectStatus(secondPage, 200, "second audit page with composite cursor");
  expect(secondPage.payload.events.length).toBeGreaterThan(0);
  expect(secondPage.payload.events.every(event =>
    event.occurred_at < cursorEvent.occurred_at
      || (event.occurred_at === cursorEvent.occurred_at && event.id < cursorEvent.id)
  )).toBe(true);

  const sample = all.payload.events.find(event => event.institution_id === institutionOne);
  expect(sample).toBeTruthy();
  const filtered = await api(page, `/api/platform/audit?limit=100&institutionId=${institutionOne}&action=${encodeURIComponent(sample.action)}&actorUserId=${sample.actor_user_id}&outcome=${sample.outcome}&search=${encodeURIComponent(sample.request_id)}`);
  expectStatus(filtered, 200, "combined audit filters");
  expect(filtered.payload.events.length).toBeGreaterThan(0);
  expect(filtered.payload.events.every(event => event.institution_id === institutionOne
    && event.action === sample.action && event.actor_user_id === sample.actor_user_id
    && event.outcome === sample.outcome && event.request_id === sample.request_id)).toBe(true);

  await operator.context.close();
});

test("Auditoría: búsqueda textual, detalle individual y controles de navegador", async ({ browser }) => {
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page } = operator;

  const listed = await api(page, "/api/platform/audit?limit=10");
  expectStatus(listed, 200, "audit listing for detail lookup");
  const eventId = listed.payload.events[0]?.id;
  expect(eventId).toBeTruthy();
  const detail = await api(page, `/api/platform/audit/${eventId}`);
  expectStatus(detail, 200, "individual audit detail");
  expect(detail.payload.event.id).toBe(eventId);
  expect(detail.payload.event.metadata_redacted).toBeTruthy();

  const exactSearch = await api(page, `/api/platform/audit?limit=100&search=${encodeURIComponent(detail.payload.event.request_id)}`);
  expectStatus(exactSearch, 200, "audit textual search");
  expect(exactSearch.payload.events.some(event => event.id === eventId)).toBe(true);

  await page.goto("/dashboard/platform");
  const audit = page.locator("#global-audit");
  await expect(audit).toBeVisible();
  await expect(audit.getByText("Auditoría global", { exact: true })).toBeVisible();
  const searchBox = audit.getByRole("textbox", { name: "Buscar en auditoría" });
  await expect(searchBox).toBeVisible();
  await searchBox.fill(detail.payload.event.request_id);
  await expect(audit.getByRole("button", { name: "Ver detalle" }).first()).toBeVisible();
  await audit.getByRole("button", { name: "Ver detalle" }).first().click();
  await expect(audit.getByText("Detalle del evento", { exact: true })).toBeVisible();

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

test("Administradores: edición, suspensión, reactivación, idempotencia y sesión cerrada", async ({ browser }) => {
  expect(targetUserId).toBeTruthy();
  const operator = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const { page, context } = operator;
  const assignment = await api(page, `/api/platform/institutions/${institutionOne}/administrators`, "POST", {
    userId: targetUserId, reason: "Asignación sintética para ciclo de vida de administrador",
  }, { "Idempotency-Key": `admin-lifecycle-${randomUUID()}` });
  expectStatus(assignment, 201, "synthetic lifecycle administrator assignment");
  const membershipId = assignment.payload.administrator.membership_id;

  let roster = await api(page, `/api/platform/institutions/${institutionOne}/administrators`);
  expectStatus(roster, 200, "institution administrator roster");
  let admin = roster.payload.administrators.find(item => item.membership_id === membershipId);
  expect(admin?.updated_at).toBeTruthy();

  const editKey = `admin-edit-${randomUUID()}`;
  const editBody = { displayName: "Administrador E2E Editado", expectedUpdatedAt: admin.updated_at,
    reason: "Edición sintética de nombre institucional" };
  const editPath = `/api/platform/institutions/${institutionOne}/administrators/${membershipId}`;
  const edited = await api(page, editPath, "PATCH", editBody, { "Idempotency-Key": editKey });
  expectStatus(edited, 200, "administrator display name edit");
  expect(edited.payload.administrator.display_name).toBe(editBody.displayName);
  const replay = await api(page, editPath, "PATCH", editBody, { "Idempotency-Key": editKey });
  expectStatus(replay, 200, "idempotent administrator edit replay");
  expect(replay.payload.administrator.updated_at).toBe(edited.payload.administrator.updated_at);

  const stale = await api(page, editPath, "PATCH", { ...editBody, displayName: "Nombre obsoleto" },
    { "Idempotency-Key": `admin-stale-${randomUUID()}` });
  expectStatus(stale, 409, "optimistic concurrency rejects stale administrator version");

  const statusPath = `${editPath}/status`;
  const suspendKey = `admin-suspend-${randomUUID()}`;
  const suspendBody = { status: "suspended", expectedUpdatedAt: edited.payload.administrator.updated_at,
    reason: "Suspensión sintética de administrador institucional" };
  const [suspended, concurrentReplay] = await Promise.all([
    api(page, statusPath, "PATCH", suspendBody, { "Idempotency-Key": suspendKey }),
    api(page, statusPath, "PATCH", suspendBody, { "Idempotency-Key": suspendKey }),
  ]);
  expectStatus(suspended, 200, "administrator suspension");
  expectStatus(concurrentReplay, 200, "concurrent idempotent suspension replay");
  expect(suspended.payload.administrator.status).toBe("suspended");
  expect(concurrentReplay.payload.administrator.updated_at).toBe(suspended.payload.administrator.updated_at);

  roster = await api(page, `/api/platform/institutions/${institutionOne}/administrators`);
  const remainingActive = roster.payload.administrators.find(item => item.status === "active" && item.membership_id !== membershipId);
  expect(remainingActive).toBeTruthy();
  const lastAdmin = await api(page, `/api/platform/institutions/${institutionOne}/administrators/${remainingActive.membership_id}/status`, "PATCH", {
    status: "suspended", expectedUpdatedAt: remainingActive.updated_at,
    reason: "Intento de suspender al último administrador activo",
  }, { "Idempotency-Key": `admin-last-${randomUUID()}` });
  expectStatus(lastAdmin, 409, "last active administrator protection");

  const reactivated = await api(page, statusPath, "PATCH", {
    status: "active", expectedUpdatedAt: suspended.payload.administrator.updated_at,
    reason: "Reactivación sintética del administrador institucional",
  }, { "Idempotency-Key": `admin-reactivate-${randomUUID()}` });
  expectStatus(reactivated, 200, "administrator reactivation");
  expect(reactivated.payload.administrator.status).toBe("active");

  await page.goto("/dashboard/platform");
  await expect(page.getByText("Administradores institucionales", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true }).first()).toBeVisible();
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

  // Authorization is evaluated before route parameter validation for this handler.
  expectStatus(await api(page, "/api/platform/institutions/not-a-uuid/administrators"), 403,
    "ordinary identity is denied before malformed resource resolution");
  expectStatus(await api(page, `/api/platform/institutions/${institutionOne}/administrators/not-a-uuid`, "DELETE", {
    reason: "Intento con identificador de membresía manipulado",
  }, { "Idempotency-Key": `malformed-membership-${randomUUID()}` }), 403,
  "ordinary identity is denied before any mutation");
  await ordinary.close();
});
