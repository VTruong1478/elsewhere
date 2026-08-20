import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/env";

/**
 * E2E config for the audit remediation work.
 *
 * Runs against `npm run dev` (not a production build) on purpose: dev auth
 * hard-404s unless NODE_ENV === "development" (app/api/dev-auth/login/route.ts),
 * so authenticated specs only work against the dev server.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:3000",
    // Headless: the suite must not spawn visible Chrome windows.
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Anonymous specs: everything except *.auth.spec.ts.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/.*\.auth\.spec\.ts/, /auth\.setup\.ts/],
    },
    {
      // Authenticated specs. Skip themselves when dev-auth creds are absent.
      name: "chromium-auth",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testMatch: /.*\.auth\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],

  // Reuses a dev server already running on :3000 so the suite and manual
  // browsing share one process (Next holds a single .next/dev lock).
  // Verify the app on :3000 is Elsewhere — another project on this machine
  // has previously occupied this port.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
