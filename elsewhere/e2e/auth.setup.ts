import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  DEV_AUTH_EMAIL,
  DEV_AUTH_PASSWORD,
  HAS_DEV_AUTH,
  STORAGE_STATE,
} from "./env";

/**
 * Signs in once and saves cookies for the authenticated project.
 *
 * Drives the real /login form rather than posting to /api/dev-auth/login
 * directly: the form also runs a real supabase signInWithPassword, so this is
 * the only path that yields BOTH the sb-* session cookies (needed for
 * client-side getSession()) and the dev_auth cookie (needed by middleware).
 */
setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  if (!HAS_DEV_AUTH) {
    // Write an empty state so the authenticated project can still load a
    // storageState file; its specs guard on HAS_DEV_AUTH and skip.
    fs.writeFileSync(
      STORAGE_STATE,
      JSON.stringify({ cookies: [], origins: [] }, null, 2),
    );
    setup.skip(
      true,
      "DEV_AUTH_EMAIL / DEV_AUTH_PASSWORD not set in .env.local — skipping sign-in.",
    );
    return;
  }

  await page.goto("/login");
  // Each auth page renders its whole form twice (a lg:hidden mobile copy and a
  // hidden lg:block desktop copy), duplicating every field and its DOM id, so
  // we must target the copy that is actually visible at this viewport.
  await page.locator('input[type="email"]:visible').first().fill(DEV_AUTH_EMAIL);
  await page
    .locator('input[type="password"]:visible')
    .first()
    .fill(DEV_AUTH_PASSWORD);
  await page
    .locator("button:visible")
    .filter({ hasText: /^(log in|sign in)$/i })
    .first()
    .click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: STORAGE_STATE });
});
