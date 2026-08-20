import { test, expect } from "@playwright/test";

/**
 * Proves the harness boots and the dev server serves a public route.
 * /feed is in middleware PUBLIC_PATHS, so this needs no authentication.
 */
test("feed renders for an anonymous visitor", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/feed/);
  await expect(page.locator("body")).toBeVisible();
});
