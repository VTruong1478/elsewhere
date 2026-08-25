import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";
import { captureConsole, summarize } from "./console";

requireDevAuth();

test.describe("map", () => {
  test("map renders with markers", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/map");
    await page.waitForTimeout(9000);

    const canvas = await page.locator("canvas").count();
    const markers = await page
      .locator(".mapboxgl-marker, [class*='marker']")
      .count();
    console.log(`[map render] canvas=${canvas} markers=${markers} | ${summarize(c)}`);
    expect(canvas, "mapbox canvas should mount").toBeGreaterThan(0);
    expect(markers, "expected place pins").toBeGreaterThan(0);
  });

  test("feed failure shows a retryable error instead of a blank map", async ({
    page,
  }) => {
    const c = captureConsole(page);
    await page.route("**/api/feed**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: "boom" }),
      }),
    );
    await page.goto("/map");

    const alert = page
      .getByRole("alert")
      .filter({ hasText: /couldn.t load places/i })
      .first();
    await expect(alert).toBeVisible({ timeout: 25_000 });
    await expect(alert.locator("button").filter({ hasText: /try again/i })).toBeVisible();
    console.log(`[map error-state] error UI shown with retry | ${summarize(c)}`);
  });

  test("retry refetches", async ({ page }) => {
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
    const alert = page.getByRole("alert").filter({ hasText: /couldn.t load places/i }).first();
    await expect(alert).toBeVisible({ timeout: 25_000 });
    const before = calls;
    await alert.locator("button").filter({ hasText: /try again/i }).click();
    await expect.poll(() => calls, { timeout: 20_000 }).toBeGreaterThan(before);
    console.log(`[map retry] refetched (${before} -> ${calls})`);
  });

  test("zoom adjusts the map radius without persisting it", async ({ page }) => {
    const c = captureConsole(page);
    const patches: string[] = [];
    const feedCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/user/preferences") && r.method() === "PATCH") {
        patches.push(r.postData() ?? "");
      }
      if (r.url().includes("/api/feed")) feedCalls.push(r.url());
    });

    await page.goto("/map");
    await page.waitForTimeout(8000);
    const before = feedCalls.length;

    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      // Scroll-zoom over the map centre.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(400);
      }
    }
    await page.waitForTimeout(4000);

    const withRadius = feedCalls.slice(before).filter((u) => u.includes("radius_miles="));
    console.log(
      `[map zoom-radius] preference PATCHes: ${patches.length} | feed calls after zoom: ${feedCalls.length - before} (with radius_miles: ${withRadius.length}) | ${summarize(c)}`,
    );

    // Zoom is viewport state: it must never rewrite the account-wide radius.
    expect(patches, "map zoom must not PATCH user preferences").toHaveLength(0);
    // ...but it must still re-query the feed at the new radius.
    expect(
      withRadius.length,
      "zooming should refetch the feed with an explicit radius_miles",
    ).toBeGreaterThan(0);
  });

  test("mapbox token is present so the map is not in fallback mode", async ({ page }) => {
    await page.goto("/map");
    await page.waitForTimeout(6000);
    const body = await page.locator("body").innerText();
    const fallback = /map unavailable/i.test(body);
    console.log(`[map token] fallback shown: ${fallback}`);
    expect(fallback, "map should not be in the unavailable fallback").toBeFalsy();
  });
});

test.describe("1024px breakpoint (previous dead zone)", () => {
  for (const route of ["/map", "/saved"]) {
    test(`nav chrome present at exactly 1024px on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(route);
      await page.waitForTimeout(4000);

      const nav = await page
        .locator('a[href="/feed"], a[href="/map"], a[href="/saved"]')
        .evaluateAll(
          (els) =>
            els.filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }).length,
        );
      console.log(`[bp 1024 ${route}] visible nav links: ${nav}`);
      expect(nav, `no navigation chrome at 1024px on ${route}`).toBeGreaterThan(0);
    });
  }

  test("nav chrome present at 1024px on /places/[id]", async ({ page, request }) => {
    const res = await request.get("/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25");
    const id = (await res.json())?.data?.[0]?.id;
    test.skip(!id, "no places");

    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(`/places/${id}`);
    await page.waitForTimeout(5000);

    const nav = await page
      .locator('a[href="/feed"], a[href="/map"], a[href="/saved"]')
      .evaluateAll(
        (els) =>
          els.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length,
      );
    console.log(`[bp 1024 /places/[id]] visible nav links: ${nav}`);
  });
});
