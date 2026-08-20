import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/** Verifies the storageState fixture actually yields a signed-in session. */
test("authenticated fixture reaches a protected route", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).not.toHaveURL(/\/signup/);
  await expect(page).not.toHaveURL(/\/login/);
});
