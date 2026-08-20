import { test, expect } from "@playwright/test";

/**
 * Item 7 — the app shell used min-[1025px]: while every page grid used Tailwind's
 * `lg` (1024px). At exactly 1024px the shell stayed mobile while page grids went
 * desktop; on /map that left NO navigation chrome at all. tailwind.config.js now
 * sets lg = 1025px so the two agree.
 *
 * Only public routes are exercised: /saved redirects anonymous visitors.
 */
const PUBLIC_ROUTES = ["/feed", "/map"];

/** Count visible in-app nav links, regardless of which chrome renders them. */
async function visibleNavLinks(page: import("@playwright/test").Page) {
  return page.locator('a[href="/feed"], a[href="/map"], a[href="/saved"]').evaluateAll(
    (els) =>
      els.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length,
  );
}

for (const width of [1023, 1024, 1025]) {
  for (const route of PUBLIC_ROUTES) {
    test(`navigation is present at ${width}px on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route);
      await page.waitForTimeout(500);

      expect(
        await visibleNavLinks(page),
        `no navigation chrome at ${width}px on ${route}`,
      ).toBeGreaterThan(0);
    });
  }
}

test("1024px gets mobile chrome, 1025px gets desktop chrome", async ({ page }) => {
  // Bottom tabs expose a Profile link; the desktop header does not.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/feed");
  await page.waitForTimeout(500);
  await expect(page.locator('a[href="/map"]')).toBeVisible();

  await page.setViewportSize({ width: 1025, height: 800 });
  await page.waitForTimeout(500);
  await expect(page.locator("header").first()).toBeVisible();
});
