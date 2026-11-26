import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const githubEnv = process.env.GITHUB_ENV;
if (!url || !serviceRoleKey || !githubEnv) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GITHUB_ENV are required for local E2E seeding.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = `E2E-${randomBytes(24).toString("base64url")}-Aa1!`;
const identities = [
  { key: "SUPERADMIN_A", email: "superadmin-a@edunexa.test", app_metadata: { platform_role: "superadmin" } },
  { key: "SUPERADMIN_B", email: "superadmin-b@edunexa.test", app_metadata: { platform_role: "superadmin" } },
  { key: "TARGET", email: "superadmin-target@edunexa.test", app_metadata: {} },
];

const created = {};
for (const identity of identities) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identity.email,
    password,
    email_confirm: true,
    app_metadata: identity.app_metadata,
    user_metadata: { display_name: `EDUNEXA Synthetic ${identity.key}` },
  });
  if (error || !data.user) {
    throw new Error(`Could not create local synthetic identity ${identity.key}: ${error?.message ?? "missing user"}`);
  }
  created[identity.key] = data.user.id;
}

const entries = {
  E2E_SUPERADMIN_A_EMAIL: identities[0].email,
  E2E_SUPERADMIN_B_EMAIL: identities[1].email,
  E2E_TARGET_EMAIL: identities[2].email,
  E2E_TARGET_USER_ID: created.TARGET,
  E2E_SYNTHETIC_PASSWORD: password,
};
for (const value of Object.values(entries)) {
  process.stdout.write(`::add-mask::${value}\n`);
}
appendFileSync(githubEnv, Object.entries(entries).map(([key, value]) => `${key}=${value}\n`).join(""));
process.stdout.write("PASS: created three isolated local Auth identities (two Superadmins and one ordinary user).\n");
