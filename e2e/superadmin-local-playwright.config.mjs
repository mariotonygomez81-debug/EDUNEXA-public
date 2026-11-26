import { defineConfig } from "@playwright/test";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EDUNEXA_APP_URL",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing local Superadmin E2E environment variable: ${name}`);
}

export default defineConfig({
  testDir: ".",
  testMatch: ["superadmin-authenticated.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.EDUNEXA_APP_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname localhost --port 3101",
    url: `${process.env.EDUNEXA_APP_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      EDUNEXA_APP_URL: process.env.EDUNEXA_APP_URL,
      GROQ_ALLOW_STUDENT_DATA: "false",
    },
  },
});
