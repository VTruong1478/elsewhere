import { test, expect } from "@playwright/test";

/**
 * Item 10 — /map had no isError handling at all, so a failing /api/feed
 * rendered an empty map indistinguishable from "no places near you".
 */
test("map surfaces a retryable error when the feed request fails", async ({
  page,
}) => {
  await page.route("**/api/feed**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ data: null, error: "boom" }),
    }),
  );

  await page.goto("/map");

  const alert = page.getByRole("alert").filter({ hasText: /couldn.t load places/i });
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(
    alert.getByRole("button", { name: /try again/i }),
  ).toBeVisible();
});

test("retry button refetches the feed", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/feed**", (route) => {
    calls += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ data: null, error: "boom" }),
    });
  });

  await page.goto("/map");
  const alert = page.getByRole("alert").filter({ hasText: /couldn.t load places/i });
  await expect(alert).toBeVisible({ timeout: 20_000 });

  const before = calls;
  await alert.getByRole("button", { name: /try again/i }).click();
  await expect.poll(() => calls, { timeout: 15_000 }).toBeGreaterThan(before);
});
