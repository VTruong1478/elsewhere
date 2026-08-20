import { test, expect } from "@playwright/test";

/**
 * Item 6 — /admin/photos had no admin check of its own; middleware only
 * required a session. It is now a Server Component gated on isAdminUser.
 * Anonymous visitors must never see the admin UI.
 */
test("anonymous visitor cannot see the admin photo tool", async ({ page }) => {
  await page.goto("/admin/photos");

  await expect(
    page.getByRole("heading", { name: /vibe photo selection/i }),
  ).toHaveCount(0);
});
