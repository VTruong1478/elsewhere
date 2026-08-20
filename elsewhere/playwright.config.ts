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
    baseURL: "http://localhost:3100",
    headless: false,
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

  // Dedicated port: 3000 is often occupied by another project on this machine,
  // and reusing it silently runs the whole suite against the wrong app.
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
