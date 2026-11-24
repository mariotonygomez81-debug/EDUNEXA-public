import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["student-assignment-workflow.spec.mjs", "student-due-notifications.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://edunexa-groq-staging.onrender.com",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
