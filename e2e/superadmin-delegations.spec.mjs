import { test, expect } from "@playwright/test";

const institutionOne = "10000000-0000-4000-8000-000000000001";
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

test("Delegaciones: vencimiento, doble aprobación, alcance de módulos, revocación y auditoría", async ({ browser }) => {
  expect(password).toBeTruthy();
  const a = await signIn(browser, process.env.E2E_SUPERADMIN_A_EMAIL);
  const b = await signIn(browser, process.env.E2E_SUPERADMIN_B_EMAIL);

  const expired = await api(a.page, "/api/platform/delegations", "POST", {
    institutionId: institutionOne,
    reason: "Intento sintético con vencimiento inválido",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    moduleScopes: ["docentes"],
  }, { "Idempotency-Key": "delegation-expired-synthetic-0001" });
  expect(expired.status, JSON.stringify(expired.payload)).toBe(400);

  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const requested = await api(a.page, "/api/platform/delegations", "POST", {
    institutionId: institutionOne,
    reason: "Soporte temporal sintético para validar doble aprobación",
    expiresAt,
    moduleScopes: ["docentes", "preceptor"],
  }, { "Idempotency-Key": "delegation-double-approval-synthetic-0001" });
  expect(requested.status, JSON.stringify(requested.payload)).toBe(201);
  const delegationId = requested.payload.delegationId;
  expect(delegationId).toBeTruthy();
  expect(requested.payload.status).toBe("pending_second_approval");

  const selfApproval = await api(a.page, `/api/platform/delegations/${delegationId}/approve`, "POST", {});
  expect(selfApproval.status, JSON.stringify(selfApproval.payload)).toBe(403);

  // The second Superadmin approves from the real browser console.
  await b.page.goto("/dashboard/platform");
  const operations = b.page.locator("#operations-panel");
  await expect(operations).toBeVisible();
  await expect(operations.getByText("Accesos delegados", { exact: true })).toBeVisible();
  const approve = operations.getByRole("button", { name: "Aprobar (segundo Superadministrador)", exact: true });
  await expect(approve).toBeVisible();
  await approve.click();

  const active = await api(a.page, "/api/platform/delegations");
  expect(active.status, JSON.stringify(active.payload)).toBe(200);
  const row = active.payload.delegations.find((item) => item.id === delegationId);
  expect(row).toBeTruthy();
  expect(row.status).toBe("active");
  expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
  expect(row.module_scope).toEqual(expect.arrayContaining(["docentes", "preceptor"]));

  const delegatedRead = await api(a.page, `/api/platform/delegations/${delegationId}/modules/docentes`);
  expect(delegatedRead.status, JSON.stringify(delegatedRead.payload)).toBe(200);

  const revoked = await api(b.page, `/api/platform/delegations/${delegationId}/revoke`, "POST", {
    reason: "Finalización sintética de la validación de acceso temporal",
  });
  expect(revoked.status, JSON.stringify(revoked.payload)).toBe(200);
  expect(revoked.payload.delegation?.status).toBe("revoked");

  const deniedAfterRevoke = await api(a.page, `/api/platform/delegations/${delegationId}/modules/docentes`);
  expect(deniedAfterRevoke.status, JSON.stringify(deniedAfterRevoke.payload)).toBe(403);

  const audit = await api(a.page, "/api/platform/audit?limit=100");
  expect(audit.status, JSON.stringify(audit.payload)).toBe(200);
  const actions = new Set(audit.payload.events.map((event) => event.action));
  for (const action of [
    "platform.delegation.request",
    "platform.delegation.scope.assign",
    "platform.delegation.approve",
    "platform.delegation.revoke",
  ]) {
    expect(actions.has(action), `missing audit event ${action}`).toBe(true);
  }

  await b.context.close();
  await a.context.close();
});
