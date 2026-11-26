import { test, expect } from "@playwright/test";

const institutionOne = "10000000-0000-4000-8000-000000000001";
const institutionTwo = "10000000-0000-4000-8000-000000000002";
const targetUserId = process.env.E2E_TARGET_USER_ID;
const password = process.env.E2E_SYNTHETIC_PASSWORD;

async function api(page, path, method = "GET", body = null, extraHeaders = {}) {
  return page.evaluate(async ({ path, method, body, extraHeaders }) => {
    const headers = { ...extraHeaders };
    if (body !== null) headers["Content-Type"] = "application/json";
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  }, { path, method, body, extraHeaders });
}

async function signIn(browser, baseURL, email, expectedPlatformStatus) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();

  await expect.poll(async () => (await api(page, "/api/platform/superadmins")).status, {
    message: `Auth session for ${email} must be accepted and role-checked by the real API route`,
    timeout: 30_000,
  }).toBe(expectedPlatformStatus);

  return { context, page };
}

function assertStatus(result, status, label) {
  expect(result.status, `${label}: ${JSON.stringify(result.payload)}`).toBe(status);
}

test("two independent authenticated Superadmins govern privileges, invitations and audit through real HTTP routes", async ({ browser, baseURL, request }) => {
  expect(targetUserId, "local Auth seed must export the ordinary target user UUID").toBeTruthy();
  expect(password, "local Auth seed must export the ephemeral password").toBeTruthy();

  const anonymous = await request.get(`${baseURL}/api/platform/superadmins`);
  expect(anonymous.status()).toBe(401);

  const a = await signIn(browser, baseURL, process.env.E2E_SUPERADMIN_A_EMAIL, 200);
  const b = await signIn(browser, baseURL, process.env.E2E_SUPERADMIN_B_EMAIL, 200);
  const ordinary = await signIn(browser, baseURL, process.env.E2E_TARGET_EMAIL, 403);

  const aCookies = await a.context.cookies(baseURL);
  const bCookies = await b.context.cookies(baseURL);
  expect(aCookies.length).toBeGreaterThan(0);
  expect(bCookies.length).toBeGreaterThan(0);
  expect(JSON.stringify(aCookies)).not.toBe(JSON.stringify(bCookies));

  await a.page.goto("/dashboard/platform");
  await expect(a.page.locator("#superadmin-governance")).toBeVisible();
  await b.page.goto("/dashboard/platform");
  await expect(b.page.locator("#superadmin-governance")).toBeVisible();

  const initialTargetAccess = await api(ordinary.page, "/api/platform/superadmins");
  assertStatus(initialTargetAccess, 403, "ordinary Auth identity cannot list global Superadmins");

  // Grant: A requests; A cannot approve its own request; B approves; A executes via Auth Admin API.
  const grantRequest = await api(a.page, "/api/platform/superadmins/requests", "POST", {
    targetUserId,
    action: "grant",
    reason: "Alta sintética para validar aprobación global independiente",
  });
  assertStatus(grantRequest, 201, "Superadmin A creates a grant request");
  const grantId = grantRequest.payload.requestId;
  expect(grantId).toBeTruthy();

  const selfApproveGrant = await api(a.page, `/api/platform/superadmins/requests/${grantId}/approve`, "POST", {});
  assertStatus(selfApproveGrant, 403, "requesting Superadmin cannot approve own grant");

  const approveGrant = await api(b.page, `/api/platform/superadmins/requests/${grantId}/approve`, "POST", {});
  assertStatus(approveGrant, 200, "independent Superadmin B approves grant");

  const executeGrant = await api(a.page, `/api/platform/superadmins/requests/${grantId}/execute`, "POST", {});
  assertStatus(executeGrant, 200, "Superadmin A executes approved grant");
  expect(executeGrant.payload.result?.status).toBe("completed");

  const afterGrant = await api(a.page, "/api/platform/superadmins");
  assertStatus(afterGrant, 200, "Superadmin inventory after grant");
  expect(afterGrant.payload.superadmins.some((item) => item.user_id === targetUserId)).toBe(true);

  // A fresh Auth session must observe the newly granted trusted app_metadata role.
  await ordinary.context.close();
  const targetGranted = await signIn(browser, baseURL, process.env.E2E_TARGET_EMAIL, 200);

  // Revoke: B requests; B cannot approve its own request; A approves; B executes.
  const revokeRequest = await api(b.page, "/api/platform/superadmins/requests", "POST", {
    targetUserId,
    action: "revoke",
    reason: "Revocación sintética posterior a validar el alta global",
  });
  assertStatus(revokeRequest, 201, "Superadmin B creates a revoke request");
  const revokeId = revokeRequest.payload.requestId;
  expect(revokeId).toBeTruthy();

  const selfApproveRevoke = await api(b.page, `/api/platform/superadmins/requests/${revokeId}/approve`, "POST", {});
  assertStatus(selfApproveRevoke, 403, "requesting Superadmin cannot approve own revocation");

  const approveRevoke = await api(a.page, `/api/platform/superadmins/requests/${revokeId}/approve`, "POST", {});
  assertStatus(approveRevoke, 200, "independent Superadmin A approves revocation");

  const executeRevoke = await api(b.page, `/api/platform/superadmins/requests/${revokeId}/execute`, "POST", {});
  assertStatus(executeRevoke, 200, "Superadmin B executes approved revocation");
  expect(executeRevoke.payload.result?.status).toBe("completed");

  const afterRevoke = await api(b.page, "/api/platform/superadmins");
  assertStatus(afterRevoke, 200, "Superadmin inventory after revocation");
  expect(afterRevoke.payload.superadmins.some((item) => item.user_id === targetUserId)).toBe(false);

  await targetGranted.context.close();
  const targetRevoked = await signIn(browser, baseURL, process.env.E2E_TARGET_EMAIL, 403);
  const targetAfterRevoke = await api(targetRevoked.page, "/api/platform/superadmins");
  assertStatus(targetAfterRevoke, 403, "fresh Auth session after revocation no longer has global access");

  // The two independent Superadmins remain able to administer the platform.
  const remaining = await api(a.page, "/api/platform/superadmins");
  assertStatus(remaining, 200, "remaining global operators");
  expect(remaining.payload.superadmins.length).toBeGreaterThanOrEqual(2);

  // Institution 1: A is seeded as an active institution administrator. B is not.
  const invitation = await api(a.page, `/api/platform/institutions/${institutionOne}/administrators/invite`, "POST", {
    email: "invited-admin-one@edunexa.test",
    firstName: "Synthetic",
    lastName: "AdminOne",
    reason: "Invitación sintética para probar aprobación institucional",
  }, { "Idempotency-Key": "synthetic-invite-institution-one-0001" });
  assertStatus(invitation, 201, "Superadmin A creates a real Auth email invitation and pending membership");
  const membershipOne = invitation.payload.invitation?.membership_id;
  expect(membershipOne).toBeTruthy();
  expect(invitation.payload.invitation?.status).toBe("invited");

  const unauthorizedInstitutionApproval = await api(b.page,
    `/api/institution/administrator-invitations/${membershipOne}/approve`, "POST",
    { institutionId: institutionOne });
  assertStatus(unauthorizedInstitutionApproval, 403, "global Superadmin without same-tenant administrator role cannot approve");

  const approveInstitutionInvitation = await api(a.page,
    `/api/institution/administrator-invitations/${membershipOne}/approve`, "POST",
    { institutionId: institutionOne });
  assertStatus(approveInstitutionInvitation, 200, "active administrator of institution 1 approves invitation");
  expect(approveInstitutionInvitation.payload.invitation?.status).toBe("active");

  // A global Superadmin who is not an administrator in institution 2 cannot approve there.
  const crossTenantInvitation = await api(a.page, `/api/platform/institutions/${institutionTwo}/administrators/invite`, "POST", {
    email: "invited-admin-two@edunexa.test",
    firstName: "Synthetic",
    lastName: "AdminTwo",
    reason: "Invitación sintética para validar aislamiento entre instituciones",
  }, { "Idempotency-Key": "synthetic-invite-institution-two-0001" });
  assertStatus(crossTenantInvitation, 201, "Superadmin A creates a pending invitation in institution 2");
  const membershipTwo = crossTenantInvitation.payload.invitation?.membership_id;
  expect(membershipTwo).toBeTruthy();

  const crossTenantApproval = await api(a.page,
    `/api/institution/administrator-invitations/${membershipTwo}/approve`, "POST",
    { institutionId: institutionTwo });
  assertStatus(crossTenantApproval, 403, "institution 1 administrator cannot approve institution 2 invitation");

  const institutionTwoAdmins = await api(a.page, `/api/platform/institutions/${institutionTwo}/administrators`);
  assertStatus(institutionTwoAdmins, 200, "Superadmin can inspect institution 2 administrator roster");
  expect(institutionTwoAdmins.payload.administrators.some((item) =>
    item.membership_id === membershipTwo && item.status === "invited")).toBe(true);

  // Audit evidence is read through the authenticated platform endpoint.
  const audit = await api(a.page, "/api/platform/audit?limit=100");
  assertStatus(audit, 200, "global audit endpoint");
  const actions = new Set(audit.payload.events.map((event) => event.action));
  for (const action of [
    "platform.superadmin.change.request",
    "platform.superadmin.change.approve",
    "platform.superadmin.change.execute.finish",
    "platform.institution.admin.invite",
    "platform.institution.admin.approve",
  ]) {
    expect(actions.has(action), `audit event ${action} must be visible`).toBe(true);
  }

  await targetRevoked.context.close();
  await b.context.close();
  await a.context.close();
});
